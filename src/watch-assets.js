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

// Read the site's .neraignore from the site root ('.'), matching the render
// pipeline — it stays there even though assets now live under theme/assets.
const initialCopy = () => copyFolder(sourceFolder, distFolder, '.')

// Initial copy
await initialCopy()

chokidar
    .watch(sourceFolder, { ignoreInitial: true })
    .on('all', async (event, filePath) => {
        console.log(`[watch-assets] ${event} → ${filePath}`)
        await initialCopy()
    })
