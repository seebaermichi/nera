import chokidar from 'chokidar'
import fs from 'node:fs'
import { copyFolder } from './render.js'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })

// Mirror the presentation probe in core.js (computeFolders): a site's own
// assets live under theme/assets, and a site without a theme/ folder still
// uses the legacy root assets/, so an unmigrated site watches the right folder.
// Every path is resolved against process.cwd() explicitly, as run() does, so
// nothing depends on the directory fs happens to resolve relative paths from.
const siteRoot = process.cwd()
const sourceFolder = fs.existsSync(path.join(siteRoot, 'theme'))
    ? path.join(siteRoot, 'theme', 'assets')
    : path.join(siteRoot, 'assets')
const distFolder = path.join(siteRoot, 'public')

// Read the site's .neraignore from the site root, matching the render
// pipeline — it stays there even though assets now live under theme/assets.
const initialCopy = () => copyFolder(sourceFolder, distFolder, siteRoot, 'site assets')

// Initial copy
await initialCopy()

chokidar
    .watch(sourceFolder, { ignoreInitial: true })
    .on('all', async (event, filePath) => {
        console.log(`[watch-assets] ${event} → ${filePath}`)
        await initialCopy()
    })
