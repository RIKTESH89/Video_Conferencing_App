'use client';

import { useEffect, useRef, useState } from "react";
// import { css } from "@emotion/css";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import {
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Transport,
} from "mediasoup-client/lib/types";

export default function Home() {

  const videoref = useRef(null);
  const remoteVideoref = useRef(null);

  const [params, setParams] = useState({
    encoding: [
      { rid: "r0", maxBitrate: 100000, scalabilityMode: "S1T3" }, // Lowest quality layer
      { rid: "r1", maxBitrate: 300000, scalabilityMode: "S1T3" }, // Middle quality layer
      { rid: "r2", maxBitrate: 900000, scalabilityMode: "S1T3" }, // Highest quality layer
    ],
    codecOptions: { videoGoogleStartBitrate: 1000 }, // Initial bitrate
  });

  const [deviceError, setDeviceError] = useState(null);
  const [device, setDevice] = useState(null);
  const [socket, setSocket] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [consumerTransport, setConsumerTransport] = useState(null);
  const [rtpCapabilities, setRtpCapabilities] = useState(null);

  useEffect(function(){
    const socket = io("http://localhost:4000/mediasoup");
    setSocket(socket);

    socket.emit("connection-success", ({socketId}) => {
      console.log(socketId);
    })
  },[]);

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({audio:false, 
      video:{
        width:{
          min:640,
          ideal:1920,
          max:1920
        },
        height:{
          min:480,
          ideal:1080,
          max:1080
        },
      }
    });

    if(videoref.current){
      const track = stream.getVideoTracks()[0];
      videoref.current.srcObject = stream;
      setParams((current)=>({track,...current}));
    }
  }

  const getRTPCapabilities = () => {
    socket.emit("getRtpCapabilities", (data) => {
      console.log('RTP Capabilities', data.rtpCapabilities);

      setRtpCapabilities(data.rtpCapabilities);
    })
  }

  const createDevice = async () => {
    try{
      const device = new Device();
      await device.load({
        routerRtpCapabilities: rtpCapabilities
      })

      setDevice(device);
      console.log("RTP Capabilities", rtpCapabilities);

    }catch(err){
      console.log(err);
    }
  }

  const createSendTransport = async() => {
    await socket.emit('createWebRtcTransport', {sender : true},({params}) => {

      if(params.error){
        console.log(params.error);
        return;
      }

      console.log(params);

      const transport = device.createSendTransport(params);

      setProducerTransport(transport);

      transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try{
          await socket.emit('transport-connect', { dtlsParameters})

          callback();
        }
        catch(err){
          errback(err);
        }
      });

      transport.on('produce', (parameters, callback, errback) => {
        try{
          socket.emit('transport-produce', { kind: parameters.kind, rtpParameters: parameters.rtpParameters, appData: parameters.appData },
            ({ id }) => {
              callback({ id });
            }
          );
        }
        catch(err){
          errback(err);
        }
      });
    })
  }

  
  const connectSendTransport = async () => {
    console.log(params)
    let localproducer = await producerTransport.produce(params);
    
    localproducer?.on('trackended', () => {
      console.log('track ended');
      });
      
      localproducer?.on('transportclose', () => {
      console.log('transport ended');
    });
  }
        
  const createRecvTransport = async () => {
    await socket.emit('createWebRtcTransport', {sender : false},({params}) => {

      if(params.error){
        console.log(params.error);
        return;
      }

      console.log(params);

      let transport = device.createRecvTransport(params);

      setConsumerTransport(transport);

      transport.on('connect', async({ dtlsParameters }, callback, errback) => {
        try{
          await socket.emit('transport-recv-connect', { dtlsParameters});
          callback();
        }catch(err){
          errback(err);
        }
      });
    })
  }

  const connectRecvTransport = async () => {
    await socket.emit('consume',{
      rtpCapabilities: device.rtpCapabilities}, async ({params}) => {

        if(params.error){
          console.log('error',params.error);
          return;
        }

        console.log(params);
        let consumer = await consumerTransport.consume({ id: params.id, producerId: params.producerId, kind: params.kind, rtpParameters: params.rtpParameters,});

        if(remoteVideoref.current){
          const {track} = await consumer;
        console.log('consumer',consumer);
        const newStream = new MediaStream([track]);
        console.log(newStream);
        remoteVideoref.current.srcObject = newStream;
        }
      socket.emit('consumer-resume');
      }
    
    )

  
  }



  return (
    <div>
      Hello from div
      <br />
      <br />
      <button onClick={getLocalStream}>Get Local Stream</button>
      <br />
      <br />
      <button onClick={getRTPCapabilities}>Get RTP Capabilities</button>
      <br />
      <br />
      <button onClick={createDevice}>Create Device</button>
      <br />
      <br />
      <video ref={videoref} width={300} height={400} id="localVideo" autoPlay playsInline />
      <br />
      <br />
      <video ref={remoteVideoref} width={300} height={400} id="remotevideo" autoPlay playsInline />
      <br />
      <br />
      <button onClick={createSendTransport}>Create Send Transport</button>
      <br /><br />
      <button onClick={connectSendTransport}>Connect Send Transport</button>
      <br /><br />
      <button onClick={createRecvTransport}>Create Reciever Transport</button>
      <br /><br />
      <button onClick={connectRecvTransport}>Connect Reciever Transport</button>
    </div>
  );
}
