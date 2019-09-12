#!/usr/bin/env node

/**
 * By 50characters
 */
const fs = require("fs");
const xpath = require('xpath');
const dom = require('xmldom').DOMParser;
const readlineSync = require('readline-sync');
const spawnSync = require('child_process').spawnSync;
const path = require('path');
const find = require('find');

const CWD_DIRNAME = process.cwd();
const POM_FILE = path.join(CWD_DIRNAME, 'pom.xml');
const WEBAPP_DIR = path.join(CWD_DIRNAME, 'src/main/webapp/');
const ANGULAR_JS = detectAngularJS();

const BUILD_TIMESTAMP = new Date().getTime();

init();
async function init() {
    console.time("[EXIT] Build war");
    checkFiles();
    console.info(`[INFO] Angular${ANGULAR_JS ? 'JS' : ''} detectado.`);
    const profile = readlineSync.keyInYN(`Es war de produccion?`, {defaultInput: 'Y'}) ? 'prod' : 'dev';
    const skipTest = !readlineSync.keyInYN(`Ejecutar TEST?`, {defaultInput: 'Y'});

    let pomXmlDom = await readPom();
    const buildVersion = await editPomVersion(pomXmlDom, null);
    if (skipTest) await editPomSkipTest(pomXmlDom);
    if (ANGULAR_JS) await editAppConstants(buildVersion);
    if ('dev' === profile) {
        if (ANGULAR_JS && readlineSync.keyInYN(`Quieres quitar cache en index.html?`, {defaultInput: 'Y'})) {
            await editIndexHtml();
        }
    }
    await execMaven(profile);
    await cleanBuild(profile);
    //Volvemos a agregar la build version al node despues de descartar todo
    pomXmlDom = await readPom();
    await editPomVersion(pomXmlDom, buildVersion);
    console.info('[INFO] War generado correctamente! :)');
    console.timeEnd("[EXIT] Build war");
}

function checkFiles() {
    const pomFile = fs.existsSync(POM_FILE);
    if (!pomFile) {
        printError("No se encuentra el pom.xml");
        process.exit();
    }
}

/**
 * Si NO encuentra el fichero angular.json, significa que es AngularJS
 */
function detectAngularJS() {
    const hasAngularJson = fs.existsSync(path.join(CWD_DIRNAME, 'angular.json'));
    return !hasAngularJson;
}

function readPom() {
    return new Promise((resolve, reject) => {
        try {
            fs.readFile(POM_FILE, "utf-8", function (err, xml) {
                if (err && printError(err)) reject(null);
                resolve(new dom().parseFromString(xml));
            });
        } catch(err) {reject(null);}
    });
}

/**
 * Solicitamos version y
 * Editamos el pom.xml
 */
function editPomVersion(pomXmlDom, projectVersion) {
    return new Promise((resolve, reject) => {
        try {
            let versionTags = xpath.select("//*[local-name(.)='version']", pomXmlDom);
            let versionElement = null;
            for (let i = 0; i < versionTags.length; i++) {
                if (versionTags[i].parentNode && versionTags[i].parentNode.tagName === 'project') {
                    versionElement = versionTags[i];
                    break;
                }
            }
            if (null !== versionElement) {
                let buildVersion = projectVersion || versionElement.textContent;
                if (!projectVersion) {
                    const inputVersion = readlineSync.question(`Introduzca NUEVA VERSION: (${buildVersion}) `, {
                        defaultInput: buildVersion
                    });
                        
                    if (inputVersion && inputVersion.length !== 0) buildVersion = inputVersion;
                }
            
                versionElement.textContent = buildVersion;
                writeFile(POM_FILE, pomXmlDom.toString()).then(() => resolve(buildVersion)).catch(reject);
                
            }
        } catch(err) {reject();}
    });
}

function editPomSkipTest(pomXmlDom) {
    return new Promise((resolve, reject) => {
        try {
            const tagSkipTest = new dom().parseFromString(`<maven.test.skip>true</maven.test.skip>`);
            let propertiesTags = xpath.select("//*[local-name(.)='properties']", pomXmlDom);
            let propertiesElement = null;
            for (let i = 0; i < propertiesTags.length; i++) {
                if (propertiesTags[i].parentNode && propertiesTags[i].parentNode.tagName === 'project') {
                    propertiesElement = propertiesTags[i];
                    break;
                }
            }
            propertiesElement.appendChild(tagSkipTest);
            writeFile(POM_FILE, pomXmlDom.toString()).then(resolve).catch(reject);
        } catch(err) {reject();}
    });
}

/**
 * Quitamos cache a los ficheros en el index.html cuando modo dev
 */
function editIndexHtml() {
    console.info("[INFO] Editando index.html");
    return new Promise((resolve, reject) => {
        try {
            fs.readFile(path.join(WEBAPP_DIR,'index.html'), "utf-8", function (err, html) {
                if (err && printError(err)) reject();
                let removeCache = false;
                do {
                    const inputStr = readlineSync.question(`archivos, ej: oferta: `);
                    html = replace(html, inputStr, BUILD_TIMESTAMP);
            
                    removeCache = readlineSync.keyInYN(`Quieres continuar quitando cache?`, {defaultInput: 'Y'});
                } while (removeCache);
                writeFile(path.join(WEBAPP_DIR,'index.html'), html).then(resolve).catch(reject);
            });
        } catch (err) {
            printError(err);
            reject();
        }
    });
}

function replace(data, pattern, strReplace) {
    const expJsFiles = new RegExp(`(.*${pattern}.*\.js)`, 'g');
    return data.replace(expJsFiles, `$1?${strReplace}`);
}

function editAppConstants(buildVersion) {
    return new Promise((resolve, reject) => {
        try {
            const CONSTANTS_FILE = findConstantsFile();
            if (!CONSTANTS_FILE) return resolve();

            fs.readFile(CONSTANTS_FILE, "utf-8", function (err, data) {
                if (err) printError(err);
                const expVersion = new RegExp("\(\'VERSION\',.*\)");
                const expTimestamp = new RegExp("\(\'BUILD_TIMESTAMP\',.*\)");
                data = data.replace(expVersion, `'VERSION', '${buildVersion}')`);
                data = data.replace(expTimestamp, `'BUILD_TIMESTAMP', ${BUILD_TIMESTAMP})`);
                writeFile(CONSTANTS_FILE, data).then(resolve).catch(reject);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Solo AngularJS
 */
function findConstantsFile() {
    console.time('[INFO] Find file constants');
    var findConstants = find.fileSync('app.constants.js', WEBAPP_DIR);
    console.timeEnd('[INFO] Find file constants');
    return ((findConstants || []).length > 0) ? findConstants[0] : null;
}

/**
 * prod profile:
 *  - AngularJS and Angular: mvn clean package -Pprod
 * dev profile:
 *  - AngularJS: mvn clean package -Pdev
 *  - Angular: mvn package -Pdev,webpack
 * @param {string} profile 
 */
function execMaven(profile) {
    return new Promise((resolve, reject) => {
        try {
            //TODO: comprobar que exista mvn en el path process.env.PATH
            //si no existe, comprobar en el pwd si existe el wrapper ./mvnw
            let mvnCommand = 'mvn';
            profile = profile || 'dev';
            if ('dev' == profile && !ANGULAR_JS) profile += ',webpack';
            execute(`${mvnCommand} clean package -P${profile}`)
                .then(resolve).catch(reject);
        } catch(err) {reject();}
    });
}

function writeFile(file, data) {
    return new Promise((resolve, reject) => {
        try {
            console.info(`[INFO] Writing file: ${file}`);
            fs.writeFile(file, data, function (err, res) {
                if (err) {
                    printError(err);
                    reject(err);
                }
                resolve(res);
            });
        } catch (error) {
            printError(error);
            reject(error);
        }
    });
}

async function cleanBuild(profile) {
    //Clean
    await execute(`git checkout -- ${path.join(WEBAPP_DIR,'index.html')}`);
    await execute(`git checkout -- ${POM_FILE}`);
}

function execute(command) {
    console.info('[INFO] ' + command);
    return new Promise((resolve, reject) => {
        try {
            spawnSync(command, { stdio: 'inherit', shell: true })
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}

function printError(err) {
    console.error(`[ERROR] ${err}`);
}

