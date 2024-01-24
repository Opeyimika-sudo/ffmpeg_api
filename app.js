import express from 'express'
import ffmpeg from 'fluent-ffmpeg'
import {path as ffmpegPath} from '@ffmpeg-installer/ffmpeg'
import {path as ffprobePath} from '@ffprobe-installer/ffprobe'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import config from "./firebase.config.js"

import { initializeApp } from 'firebase/app'
import { getStorage, getDownloadURL, ref, uploadBytes} from 'firebase/storage';

//initialize firebase app
initializeApp(config.firebaseConfig);

//initialize cloud storage and get a reference to the service
const storage = getStorage()


//set paths
ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

const app = express()
const port = 3000

app.use(cors())

const upload = multer({ dest: 'uploads/' })

if (!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

app.post('/split-video', upload.single('file'), async (req, res) => {
    const filePath = req.file.path;
    ffmpeg.ffprobe(filePath, (err, metadata) => {
        const duration = metadata.format.duration;
        console.log(`Duration of the video is ${duration} seconds.`);
        splitVideo(duration)
     });

    async function splitVideo(duration) {
        const segmentLength = Math.min(Math.max(30, Math.round(duration / 50)), 120);
        const numSegments = Math.ceil(duration / segmentLength);
        let outputURLs = []

       for (let i = 0; i < numSegments; i++) {
        const startTime = i*segmentLength;
        const endTime = Math.min(startTime + segmentLength, duration);
        const outputName = `output-${i}.mp4`;
        await new Promise((resolve, reject) => {
                    ffmpeg(filePath)
                    .setStartTime(startTime)
                    .setDuration(segmentLength)
                    .output(`./uploads/${outputName}`)
                    .on('end', async function(err) {
                        if(!err) {
                            await uploadAndDownloadFile(outputName, outputURLs);
                            if (outputURLs.length === numSegments) {
                                res.status(200).json({message: "Video processed successfully", urls: outputURLs});
                            }
                            resolve ()
                    }
                    })
                    .on('error', function(err){
                        console.log('error: ', err)
                        reject(err)
                    })
                    .run()
                })
       }

        
    }
})

async function uploadAndDownloadFile(outputName, urls) {
    console.log('conversion Done');
    const storageRef = ref(storage, `${outputName}`);
    // 'file' comes from the Blob or File API
    const file = fs.readFileSync(`./uploads/${outputName}`);
    const snapshot = await uploadBytes(storageRef, file,
        {
            contentType: 'video/mp4', // Set the MIME type
        }
    );
    console.log('Uploaded a blob or file!');
    const downloadURL = await getDownloadURL(snapshot.ref)
    await urls.push(downloadURL);
    console.log('Download URL inserted')
}

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
 });