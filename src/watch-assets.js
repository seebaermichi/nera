import chokidar from 'chokidar'
import { copyFolder } from './render.js'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const sourceFolder = path.resolve('assets')
const distFolder = path.resolve('public')

// Initial copy
await copyFolder(sourceFolder, distFolder)

chokidar
    .watch(sourceFolder, { ignoreInitial: true })
    .on('all', async (event, filePath) => {
        console.log(`[watch-assets] ${event} → ${filePath}`)
        await copyFolder(sourceFolder, distFolder)
    })
