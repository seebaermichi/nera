import chokidar from 'chokidar'
import fs from 'fs'
import { copyFolder } from './render.js'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

// Mirror the presentation probe in core.js (ROADMAP-themes.md §1b): a site's own
// assets live under theme/ in the revised layout, falling back to the legacy
// root assets/ so an unmigrated site still watches the right folder.
const sourceFolder = fs.existsSync('theme')
    ? path.resolve('theme/assets')
    : path.resolve('assets')
const distFolder = path.resolve('public')

// Initial copy
await copyFolder(sourceFolder, distFolder)

chokidar
    .watch(sourceFolder, { ignoreInitial: true })
    .on('all', async (event, filePath) => {
        console.log(`[watch-assets] ${event} → ${filePath}`)
        await copyFolder(sourceFolder, distFolder)
    })
