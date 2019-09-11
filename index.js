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

const CWD_DIRNAME = process.cwd();
const POM_FILE = path.join(CWD_DIRNAME, 'pom.xml');
const WEBAPP_DIR = path.join(CWD_DIRNAME, 'src/main/webapp/');
const CONSTANTS_FILE = path.join(WEBAPP_DIR, 'app/app.constants.js');

const BUILD_TIMESTAMP = new Date().getTime();

init();
async function init() {
    const profile = readlineSync.keyInYN(`Es war de produccion?`, {defaultInput: 'Y'}) ? 'prod' : 'dev';

    await editPom();
    if ('dev' === profile) {
        await editIndexHtml();
    }
    await execMaven(profile);
    cleanBuild(profile);
}

/**
 * Solicitamos version y
 * Editamos el pom.xml
 */
function editPom() {
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
            
                    writeFile(POM_FILE, doc.toString());
                    editAppConstants(buildVersion);
                    resolve();
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
                console.log(html);
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
    fs.readFile(CONSTANTS_FILE, "utf-8", function (err, data) {
        if (err) console.error(err);
        const expVersion = new RegExp("\(\'VERSION\',.*\)");
        const expTimestamp = new RegExp("\(\'BUILD_TIMESTAMP\',.*\)");
        data = data.replace(expVersion, `'VERSION', '${buildVersion}')`);
        data = data.replace(expTimestamp, `'BUILD_TIMESTAMP', ${BUILD_TIMESTAMP})`);
        writeFile(CONSTANTS_FILE, data);
    });
}

async function execMaven(profile) {
    profile = profile || 'dev';
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
    return new Promise((resolve, reject) => {
        try {
            spawn(command, { stdio: 'inherit', shell: true });
            resolve();
        } catch (err) {
            reject(err);
        }
    });
}
