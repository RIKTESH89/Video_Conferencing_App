import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import mediasoup from "mediasoup";
import fs from 'fs';

const app = express();
const port = 4000;

const options = {
    key: fs.readFileSync('./serverSSL/key.pem', 'utf-8'),
    cert: fs.readFileSync('./serverSSL/cert.pem', 'utf-8')
  }

const server = http.createServer(options,app);

app.use(cors({
    origin: "*",
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: "*",
        credentials: true
    }
});

const peers = io.of('/mediasoup');  

let worker;
let router;
let producerTransport;
let consumerTransport;
let producer;
let consumer;


const createWorker = async () => {
    
    worker = await mediasoup.createWorker({
        rtcMinPort: 2000,
        rtcMaxPort: 2020,
    });
        
    console.log("worker created", worker.pid);
        
    worker.on('died', () => {
        console.log('worker died');
        setTimeout(() => {
        process.exit(1);
        },2000);
    });
                
    return worker;
}

worker = await createWorker();

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/vp8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000
        }
    }
];



peers.on('connection', async (socket) => {
    console.log('peer connected', socket.id);
    socket.emit('connection-success', { socketId: socket.id });


    socket.on('disconnect', () => {
        console.log('peer disconnected', socket.id);
    });

    router = await worker.createRouter({
        mediaCodecs: mediaCodecs
    });


    socket.on('getRtpCapabilities', (callback) => {
        const rtpCapabilities = router.rtpCapabilities;
        console.log('rtpCapabilities', rtpCapabilities);
        callback({rtpCapabilities});
    })


    socket.on('createWebRtcTransport', async ({sender}, callback) => {
        if(sender)
            producerTransport = await createWebRtcTransport(callback)
        else
        consumerTransport = await createWebRtcTransport(callback)
    })


    socket.on('transport-connect', async ({ dtlsParameters }) => {
        console.log("DTLS Params", {dtlsParameters});
        await producerTransport.connect({ dtlsParameters });
    })


    socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
        producer = await producerTransport.produce({
            kind,
            rtpParameters,
        });
        console.log("Producer ID", producer.id, producer.kind);

        producer.on('transportclose', () => {
            console.log('transport for the producer is close');
            producer.close();
        });

        callback({
            id: producer.id,
        })
    })

    socket.on('transport-recv-connect', async ({ dtlsParameters }) => {
        console.log(`DTLS PARAMS: ${dtlsParameters}`)
        await consumerTransport.connect({ dtlsParameters })
      })

    socket.on('consume', async ({ rtpCapabilities }, callback) => {
        try {
            // check if the router can consume the specified producer
            if (router.canConsume({
              producerId: producer.id,
              rtpCapabilities
            })) {
              // transport can now consume and return a consumer
              consumer = await consumerTransport.consume({
                producerId: producer.id,
                rtpCapabilities,
                paused: true,
              })
      
              consumer.on('transportclose', () => {
                console.log('transport close from consumer')
              })
      
              consumer.on('producerclose', () => {
                console.log('producer of consumer closed')
              })
      
              // from the consumer extract the following params
              // to send back to the Client
              const params = {
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              }
      
              // send the parameters to the client
              callback({ params })
            }
          } catch (error) {
            console.log(error.message)
            callback({
              params: {
                error: error
              }
            })
          }
    })

    socket.on('consumer-resume', async () => {
        console.log('consumer resume')
        await consumer.resume()
      })


})

const createWebRtcTransport = async (callback) => {
    try{
        const webRtcTransport_options = {
            listenIps: [
              {
                ip: '127.0.0.1', // replace with relevant IP address
                // announcedIp: '127.0.0.1',
              }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
          }

        let transport = await router.createWebRtcTransport(webRtcTransport_options)
        console.log('transport id: ', transport.id);

        transport.on('dtlsstatechange', (dtlsState) => {
            if(dtlsState === "closed"){
                transport.close();
            }
        });

        transport.on('close', () => {
            console.log('transport closed');
        });

        callback({
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            }
        })

        return transport
    }
    catch(err){
        console.log(err);
        callback({
            params: {
                error: err
            }
        })
    }
}
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
})