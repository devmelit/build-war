#!/usr/bin/env node

/**
 * By 50characters
 * 
 */
const fs = require("fs");
const xpath = require('xpath');
const dom = require('xmldom').DOMParser;
const readlineSync = require('readline-sync');
const spawn = require('child_process').spawn;
const path = require('path');
const find = require('find');

const CWD_DIRNAME = process.cwd();
const POM_FILE = path.join(CWD_DIRNAME, 'pom.xml');
const WEBAPP_DIR = path.join(CWD_DIRNAME, 'src/main/webapp/');
const ANGULAR_JS = detectAngularJS();

const BUILD_TIMESTAMP = new Date().getTime();

init();
async function init() {
    console.info(`Angular${ANGULAR_JS ? 'JS' : ''} detectado.`);
    const profile = readlineSync.keyInYN(`Es war de produccion?`, {defaultInput: 'Y'}) ? 'prod' : 'dev';
    const skipTest = !readlineSync.keyInYN(`Ejecutar TEST?`, {defaultInput: 'Y'});

    const buildVersion = await editPom(skipTest);
    if (ANGULAR_JS) await editAppConstants(buildVersion);
    if ('dev' === profile) {
        if (ANGULAR_JS && readlineSync.keyInYN(`Quieres quitar cache en index.html?`, {defaultInput: 'Y'})) {
            await editIndexHtml();
        }
    }
    await execMaven(profile);
    cleanBuild(profile);
}

/**
 * Si NO encuentra el fichero angular.json, significa que es AngularJS
 */
function detectAngularJS() {
    const hasAngularJson = fs.existsSync(path.join(CWD_DIRNAME, 'angular.json'));
    return !hasAngularJson;
}

/**
 * Solicitamos version y
 * Editamos el pom.xml
 */
function editPom(skipTest) {
    return new Promise((resolve, reject) => {
        try {
            fs.readFile(POM_FILE, "utf-8", function (err, xml) {
                if (err && console.error(err)) reject();
                var doc = new dom().parseFromString(xml);
                var versionTags = xpath.select("//*[local-name(.)='version']", doc);
                var versionElement = null;
                for (var i = 0; i < versionTags.length; i++) {
                    if (versionTags[i].parentNode && versionTags[i].parentNode.tagName === 'project') {
                        versionElement = versionTags[i];
                        break;
                    }
                }
                if (null !== versionElement) {
                    let buildVersion = versionElement.textContent;
                    const inputVersion = readlineSync.question(`Introduzca NUEVA VERSION: (${buildVersion}) `, {
                        defaultInput: buildVersion
                    });
                    
                    if (inputVersion && inputVersion.length !== 0) buildVersion = inputVersion;
            
                    let newNode = new dom().parseFromString(`<version>${buildVersion}</version>`);
                    versionElement.parentNode.replaceChild(newNode, versionElement);

                    if (skipTest) {
                        const tagSkipTest = new dom().parseFromString(`<maven.test.skip>true</maven.test.skip>`);
                        var propertiesTags = xpath.select("//*[local-name(.)='properties']", doc);
                        var propertiesElement = null;
                        for (var i = 0; i < propertiesTags.length; i++) {
                            if (propertiesTags[i].parentNode && propertiesTags[i].parentNode.tagName === 'project') {
                                propertiesElement = propertiesTags[i];
                                break;
                            }
                        }
                        propertiesElement.appendChild(tagSkipTest);
                    }
            
                    writeFile(POM_FILE, doc.toString());
                    resolve(buildVersion);
                }
            });
        } catch(err) {
            reject();
        }
    });
}

/**
 * Quitamos cache a los ficheros en el index.html cuando modo dev
 */
function editIndexHtml() {
    console.info("Editando index.html");
    return new Promise((resolve, reject) => {
        try {
            fs.readFile(path.join(WEBAPP_DIR,'index.html'), "utf-8", function (err, html) {
                if (err && console.error(err)) reject();
                let removeCache = false;
                do {
                    const inputStr = readlineSync.question(`archivos, ej: oferta: `);
                    html = replace(html, inputStr, BUILD_TIMESTAMP);
            
                    removeCache = readlineSync.keyInYN(`Quieres continuar quitando cache?`, {defaultInput: 'Y'});
                } while (removeCache);
                writeFile(path.join(WEBAPP_DIR,'index.html'), html);
                resolve();
            });
        } catch (err) {
            console.error(err);
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
                if (err) console.error(err);
                const expVersion = new RegExp("\(\'VERSION\',.*\)");
                const expTimestamp = new RegExp("\(\'BUILD_TIMESTAMP\',.*\)");
                data = data.replace(expVersion, `'VERSION', '${buildVersion}')`);
                data = data.replace(expTimestamp, `'BUILD_TIMESTAMP', ${BUILD_TIMESTAMP})`);
                writeFile(CONSTANTS_FILE, data);
                resolve();
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
    console.time('Find file constants');
    var findConstants = find.fileSync('app.constants.js', WEBAPP_DIR);
    console.timeEnd('Find file constants');
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
async function execMaven(profile) {
    profile = profile || 'dev';
    if ('dev' == profile && !ANGULAR_JS) profile += ',webpack';
    await execute(`mvn clean package -P${profile}`);
}

function writeFile(file, data) {
    try {
        console.info(`Writing file: ${file}`);
        fs.writeFile(file, data, function (err, res) {
            if (err) console.error(err);
        });
    } catch (error) {
        console.error(error);
    }
}

function cleanBuild() {
    //execute(`git checkout -- ${path.join(WEBAPP_DIR,'index.html')}`);
}

function execute(command) {
    console.info(command);
    return new Promise((resolve, reject) => {
        try {
            spawn(command, { stdio: 'inherit', shell: true });
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}
