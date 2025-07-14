import fs from 'fs/promises'
import fssync from 'fs'
import path from 'path'
import cpy from 'cpy'
import pug from 'pug'
import pretty from 'pretty'
import { rimraf } from 'rimraf'
import dotenv from 'dotenv'

dotenv.config()

const SUCCESS_COLOR = '\x1b[32m%s\x1b[0m'

const getIgnoredFiles = (basePath) => {
    const ignorePath = path.join(basePath, '.neraignore')

    if (fssync.existsSync(ignorePath)) {
        return fssync
            .readFileSync(ignorePath, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
    }
    return []
}

export function ignoreFiles (ignoreList, filePath, sourceRoot) {
    const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, '/')

    return !ignoreList.some(pattern =>
        relativePath === pattern || relativePath.startsWith(`${pattern}/`)
    )
}

export const copyFolder = async (sourceFolder, targetFolder) => {
    if (fssync.existsSync(sourceFolder)) {
        const ignore = getIgnoredFiles(path.dirname(sourceFolder))

        try {
            await cpy([`${sourceFolder}/**/*`], targetFolder, {
                parents: true,
                filter: (file) => ignoreFiles(ignore, file.path, sourceFolder)
            })
            console.log(SUCCESS_COLOR, 'Assets copied')
        } catch (err) {
            console.error('Copy failed:', err)
        }
    } else {
        console.log(SUCCESS_COLOR, 'No Assets found')
    }
}

export const createHtmlFiles = async (data, viewsFolder, publicFolder) => {
    if (fssync.existsSync(viewsFolder)) {
        for (const pageData of data.pagesData) {
            data.t = (key) =>
                data.app.translations
                    ? data.app.translations[
                        pageData.meta.lang || data.app.lang
                    ]?.[key] || key
                    : key

            let html = pageData.content

            if (pageData.meta.layout) {
                const fn = pug.compileFile(
                    `${viewsFolder}/${pageData.meta.layout}`
                )
                html = fn({ ...data, ...pageData })
            }

            const htmlPath = path.join(
                publicFolder,
                pageData.meta.dirname.replace(/^\/+/, ''),
                `${pageData.meta.filename}`
            )

            await fs.mkdir(path.dirname(htmlPath), { recursive: true })
            await fs.writeFile(htmlPath, pretty(html), 'utf-8')

            console.log(
                SUCCESS_COLOR,
                `HTML created: ${pageData.meta.dirname}`
            )
        }
    } else {
        console.error('Views folder not found')
    }
}

export const deleteFolder = async (folder) => {
    if (fssync.existsSync(folder)) {
        try {
            await rimraf(folder)
            console.log(SUCCESS_COLOR, 'Public folder removed')
        } catch (error) {
            console.error(error)
        }
    }
}
