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
const figlet = require('figlet');
const minimist = require('minimist');
const clear = require('clear');
const chalk = require('chalk');

const CWD_DIRNAME = process.cwd();
const POM_FILE = path.join(CWD_DIRNAME, 'pom.xml');
const WEBAPP_DIR = path.join(CWD_DIRNAME, 'src/main/webapp/');
const ANGULAR_JS = detectAngularJS();

const BUILD_TIMESTAMP = new Date().getTime();

clear();
init();
async function init() {
    await printVersion();
    const args = getAndPrintArguments();
    checkFiles();
    printInfo(`Angular${ANGULAR_JS ? 'JS' : ''} detectado.`);
    const profile = args.profile || (readlineSync.keyInYN(`Es artifact de produccion?`, { defaultInput: 'Y' }) ? 'prod' : 'dev');
    const testSkip = args.testSkip || !readlineSync.keyInYN(`Ejecutar TEST?`, { defaultInput: 'Y' });

    let pomXmlDom = await readPom();
    const PACKAGING_EXT = await getPackagingExt(pomXmlDom);
    const buildVersion = await editPomVersion(pomXmlDom, args.release, args.silent);
    if (testSkip) await editPomTestSkip(pomXmlDom);
    if (ANGULAR_JS) await editAppConstants(buildVersion);
    if ('dev' === profile && ANGULAR_JS) {
        await editIndexHtml();
        await removeCacheStates();
    }
    await execMaven(profile)
        .then(() => printInfo(`${PACKAGING_EXT} generado correctamente! :)`))
        .catch((err) => printError(`Error al generar ${PACKAGING_EXT}! :(`));
    await cleanBuild(profile);
    if (args.output) {
        await renameOutputFile(args.output, PACKAGING_EXT).catch(printError);
    }
    //Volvemos a agregar la build version al node despues de descartar todo
    pomXmlDom = await readPom();
    await editPomVersion(pomXmlDom, buildVersion, true);
    console.timeEnd("[EXIT] Build war");
}

function getAndPrintArguments() {
    const argOpts = {
        string: ['profile', 'output', 'release'],
        boolean: ['testSkip', 'silent'],
        alias: { 'profile': 'p', 'output': 'o', 'testSkip': 't', 'release': 'r', 'silent': 's' }
    };
    const args = minimist(process.argv.slice(2), argOpts);
    const options = {};
    let info = '';
    if (args.silent || args.s) {
        options.silent = args.silent || args.s;
        info += `-silent mode: true `;
    }
    if (args.profile || args.p) {
        options.profile = args.profile || args.p;
        info += `-Profile: ${options.profile} `;
    } else if (options.silent) options.profile = 'dev'; //Default

    if (args.testSkip || args.t) {
        options.testSkip = true;
        info += `-Test Skip: true `;
    } else if (options.silent) options.testSkip = true;

    if (args.output || args.o) {
        options.output = args.output || args.o;
        info += `-Output file: ${options.output} `;
    }
    if (args.release || args.r) {
        options.release = args.release || args.r;
        info += `-Release version: ${options.release} `;
    }
    if (info.length > 0) printInfo(`Argumentos: ${info}`);
    return options;
}

function printVersion() {
    return new Promise((resolve, reject) => {
        try {
            const pjson = require('./package.json');
            console.time("[EXIT] Build war");
            figlet(`Dev Melit`, { font: 'Epic' }, function (err, data) {
                if (err) {
                    printError('Something went wrong...');
                    console.dir(err);
                    return;
                }
                console.log(chalk.greenBright(data));
                printInfo(`Version: ${pjson.version}. https://github.com/devmelit/build-war/`);
                resolve();
            });
        } catch (err) {
            printError(err);
            reject();
        }
    });
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
        } catch (err) { reject(null); }
    });
}

/**
 * Solicitamos version y
 * Editamos el pom.xml
 */
function editPomVersion(pomXmlDom, projectVersion, silent) {
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
                if (!silent && !projectVersion) {
                    const inputVersion = readlineSync.question(`Introduzca NUEVA VERSION: (${buildVersion}) `, {
                        defaultInput: buildVersion
                    });

                    if (inputVersion && inputVersion.length !== 0) buildVersion = inputVersion;
                }

                versionElement.textContent = buildVersion;
                writeFile(POM_FILE, pomXmlDom.toString()).then(() => resolve(buildVersion)).catch(reject);

            }
        } catch (err) { reject(); }
    });
}

function getPackagingExt(pomXmlDom) {
    let ext = 'jar';
    return new Promise((resolve, reject) => {
        try {
            let packagingTags = xpath.select("//*[local-name(.)='packaging']", pomXmlDom);

            ext = packagingTags[0].textContent;
            resolve(ext);
        } catch (err) { reject(ext); }
    });
}

function editPomTestSkip(pomXmlDom) {
    return new Promise((resolve, reject) => {
        try {
            const tagTestSkip = new dom().parseFromString(`<maven.test.skip>true</maven.test.skip>`);
            let propertiesTags = xpath.select("//*[local-name(.)='properties']", pomXmlDom);
            let propertiesElement = null;
            for (let i = 0; i < propertiesTags.length; i++) {
                if (propertiesTags[i].parentNode && propertiesTags[i].parentNode.tagName === 'project') {
                    propertiesElement = propertiesTags[i];
                    break;
                }
            }
            propertiesElement.appendChild(tagTestSkip);

            // Borrar nodo que ejecuta los test de front
            const executionIdTest = 'webpack build test';
            let executionTags = pomXmlDom.getElementsByTagName('execution');
            for (let i = 0; i < executionTags.length; i++) {
                const ids = executionTags[i].getElementsByTagName('id');
                if (ids.length > 0 && ids[0].textContent === executionIdTest) {
                    pomXmlDom.removeChild(executionTags[i]);
                    break;
                }
            }

            writeFile(POM_FILE, pomXmlDom.toString()).then(resolve).catch(reject);
        } catch (err) { reject(); }
    });
}

/**
 * Quitamos cache a los ficheros en el index.html cuando modo dev
 */
function editIndexHtml() {
    console.info("[INFO] Editando index.html");
    return new Promise((resolve, reject) => {
        try {
            fs.readFile(path.join(WEBAPP_DIR, 'index.html'), "utf-8", function (err, html) {
                if (err && printError(err)) reject();
                const expJsFiles = new RegExp(`(src=.*\.js)([\"\'])`, 'g');
                html = html.replace(expJsFiles, `$1?${BUILD_TIMESTAMP}$2`);
                const expCssFiles = new RegExp(`(href=.*\.css)([\"\'])`, 'g');
                html = html.replace(expCssFiles, `$1?${BUILD_TIMESTAMP}$2`);
                writeFile(path.join(WEBAPP_DIR, 'index.html'), html).then(resolve).catch(reject);
            });
        } catch (err) {
            printError(err);
            reject();
        }
    });
}

/**
 * Quitamos cache a las vistas (html) de todos los states en profile DEV
 */
function removeCacheStates() {
    return new Promise((resolve, reject) => {
        try {
            let files = find.fileSync(/\.js$/, path.join(WEBAPP_DIR, 'app'));
            if (fs.existsSync(path.join(WEBAPP_DIR, 'scripts'))) {
                Array.prototype.push.apply(files, find.fileSync(/\.js$/, path.join(WEBAPP_DIR, 'scripts')));
            }
            console.info(`[INFO] Eliminando cache html in ${files.length} states`);
            let editedFiles = 0;
            for (const file of files) {
                console.info(`[INFO] Eliminando cache de state: ${file}`);
                fs.readFile(file, 'utf8', (err, data) => {
                    if (err) {
                        return console.log(err);
                    }
                    var result = data.replace(/(.*\.html)([\'\"])/g, `$1?${BUILD_TIMESTAMP}$2`);

                    writeFile(file, result).then(() => {
                        editedFiles++;
                        if (files.length === editedFiles) resolve();
                    }).catch((err) => console.error(err));
                });
            }
        } catch (err) {
            reject(err);
        }
    });
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
        } catch (err) { reject(); }
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
    await execute(`git checkout -- ${path.join(WEBAPP_DIR, 'index.html')}`);
    await execute(`git checkout -- ${POM_FILE}`);
}

async function renameOutputFile(outputName, packagingExt) {
    try {
        const dir = 'target';
        const files = fs.readdirSync(dir);
        const match = RegExp(`.*\.${packagingExt}\.original$`);
        const matchBoot = RegExp(`.*\.${packagingExt}$`);

        files.filter(function(file) {
            return file.match(match) || file.match(matchBoot);
          }).forEach(function(file) {
            const isBoot = matchBoot.test(file);
            const filePath = path.join(dir, file);
            const outputFileName = isBoot ? 'boot-' + outputName : outputName;
            const newFilePath = path.join(dir, file.replace(isBoot ? matchBoot : match, outputFileName));

            fs.renameSync(filePath, newFilePath);
            printInfo(`${packagingExt} renombrado correctamente: ` + outputFileName);
        });
    } catch (err) {
        printError('Error al renombrar fichero');
        return null;
    }
}

function execute(command) {
    printInfo(command);
    return new Promise((resolve, reject) => {
        try {
            spawnSync(command, { stdio: 'inherit', shell: true });
        } catch (err) {
            reject(err);
        }
        resolve();
    });
}

function printInfo(info) {
    console.error(chalk.bold.blue(`[INFO] ${info}`));
}

function printError(err) {
    console.error(chalk.bold.red(`[ERROR] ${err}`));
}

