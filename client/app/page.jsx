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

let devicesetup;
let producerTransportsetup;
let saveProducerTransport;
let consumerTransportsetup;
let saveconsumerTransport;
let trackparam;
let globalremotevideoref;

const connectSendTransport = async () => {
  // console.log('connectSendTransport ka producerTransport',saveProducerTransport)
  let localproducer = await saveProducerTransport.produce(trackparam);
  // console.log(localproducer);
  
  localproducer?.on('trackended', () => {
    console.log('track ended');
    });
    
    localproducer?.on('transportclose', () => {
    console.log('transport ended');
  });
}

const createSendTransport = async(socket,device) => {
  await socket.emit('createWebRtcTransport', {sender : true},({params}) => {
    // console.log('createSendTransport ka params',params);
    if(params.error){
      console.log(params);
      return;
    }

    // console.log(params);

    const transport = device.createSendTransport(params);

    console.log('send transport',transport);


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

    // setProducerTransport(transport);
    // return transport;
    producerTransportsetup(transport);

    // connectSendTransport(params,transport);
  })
}

const connectRecvTransport = async (device,socket) => {
  await socket.emit('consume',{
    rtpCapabilities: device.rtpCapabilities}, async ({params}) => {
      
      console.log('params in connectRecvTransport',params);
      if(params.error){
        console.log('error',params.error);
        return;
      }

      // console.log(params);
      let consumer = await saveconsumerTransport.consume({ id: params.id, producerId: params.producerId, kind: params.kind, rtpParameters: params.rtpParameters,});

      if(globalremotevideoref.current){
        const {track} = await consumer;
      console.log('consumer',consumer);
      const newStream = new MediaStream([track]);
      console.log(newStream);
      globalremotevideoref.current.srcObject = newStream;
      }
    socket.emit('consumer-resume');
    }
  
  )

}


const createRecvTransport = async (socket,device) => {
  await socket.emit('createWebRtcTransport', {sender : false},({params}) => {

    if(params.error){
      console.log(params.error);
      return;
    }

    // console.log('device in createRecvTransport',device);

    const transport = device.createRecvTransport(params);
    
    console.log('consumer transport',transport);

    // setConsumerTransport(transport);

    transport.on('connect', async({ dtlsParameters }, callback, errback) => {
      try{
        await socket.emit('transport-recv-connect', { dtlsParameters});
        callback();
      }catch(err){
        errback(err);
      }
    });

    consumerTransportsetup(transport);
  })
}

const getRTPCapabilities = async (socket,isProducer) => {
  socket.emit("createRoom", async (data) => {
    console.log('RTP Capabilities in true isProducer', data.rtpCapabilities);

    // setRtpCapabilities(data.rtpCapabilities);
    await createDevice(data.rtpCapabilities,isProducer);
    // return newDevice;
  })
}

const createDevice = async (rtpCapabilities,isProducer) => {
  try{
    // console.log('device setting on load rtpCapabilities',rtpCapabilities);

    const newdevice = new Device();
    await newdevice.load({
      routerRtpCapabilities: rtpCapabilities
    })

    // setDevice(newdevice);
    if(devicesetup){
      devicesetup(newdevice);
    }
    console.log("device created", newdevice);

  }catch(err){
    console.log(err);
  }
}


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

  const [isProducer, setIsProducer] = useState(false);
  const [device, setDevice] = useState(null);
  const [isDevice,setisDevice] = useState(false);
  const [socket, setSocket] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [consumerTransport, setConsumerTransport] = useState(null);
  const [rtpCapabilities, setRtpCapabilities] = useState(null);


  useEffect(function(){
    const socket = io("http://localhost:4000/mediasoup");
    setSocket(socket);

    socket.emit("connection-success", ({socketId,existsProducer}) => {
      console.log(socketId,existsProducer);
    })
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
        let newparams = params;
        newparams = {track,...newparams}; 
        setParams((current)=>({track,...current}));
        goConnect(true);
        setIsProducer(true);
      }
    }

    getLocalStream();

    return () => {
      socket.disconnect();
    };
  },[]);
  
  
  const goConsume = () => {
    goConnect(false);
  }

  const goConnect = async (producerOrConsumer) => {
    setIsProducer(producerOrConsumer);
    console.log('producerOrConsumer changed on pressing cosume',producerOrConsumer);
    if(device == null){
      console.log('device not created yet');
    }
  }

  useEffect(function(){

    devicesetup = setDevice;
    producerTransportsetup = setProducerTransport;
    trackparam = params;
    saveProducerTransport = producerTransport;
    globalremotevideoref = remoteVideoref;
    consumerTransportsetup = setConsumerTransport;
    saveconsumerTransport = consumerTransport;

    const makingDevice = async () => {
      await getRTPCapabilities(socket,isProducer);
      console.log(device);
    }

    const creatingSendTransport = async () => {
      if(producerTransport == null){
        await createSendTransport(socket,device);
      }
      console.log(saveProducerTransport);
        if(producerTransport){
          await connectSendTransport();
        }
    }

    const creatingRecvTransport = async () => {
      if(consumerTransport == null){
        await createRecvTransport(socket,device);
      }
      console.log(saveconsumerTransport);
        if(consumerTransport){
          await connectRecvTransport(device,socket);
        }
    }

    if(socket){
    if(device == null){
      makingDevice();
    }
    else{
      console.log('device already created in new way',params);
      if(isProducer){
        creatingSendTransport();
      }
      else{
        creatingRecvTransport();
      }
    }
  }
  return () => {
    devicesetup = null;
    producerTransportsetup = null;
    trackparam = null;
    saveProducerTransport = null;
    globalremotevideoref = null;
    saveconsumerTransport = null;
    consumerTransportsetup = null;
  }
  },[isProducer,device,producerTransport,consumerTransport]);
  
  // not changing the socket or isProducer here


  return (
    <div>
      <br />
      <br />
      <video ref={videoref} width={300} height={400} id="localVideo" autoPlay playsInline />
      <br />
      <br />
      <video ref={remoteVideoref} width={300} height={400} id="remotevideo" autoPlay playsInline />
      <br />
      <br />
      {/* <button onClick={getLocalStream}>Publish</button> */}
      <button onClick={goConsume}>Consume</button>
    </div>
  );
}
