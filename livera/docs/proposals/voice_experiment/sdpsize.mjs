import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8099/log');
const r = await page.evaluate(async () => {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  const pc = new RTCPeerConnection();
  pc.addTrack(s.getAudioTracks()[0], s);
  const cands = [];
  pc.onicecandidate = (e) => { if (e.candidate) cands.push(JSON.stringify(e.candidate.toJSON()).length); };
  await pc.setLocalDescription(await pc.createOffer());
  const trickleOffer = pc.localDescription.sdp.length;
  await new Promise((res) => { if (pc.iceGatheringState === 'complete') res(); pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && res(); setTimeout(res, 3000); });
  return { trickleOfferBytes: trickleOffer, fullOfferBytes: pc.localDescription.sdp.length, candidates: cands.length, candidateJsonBytes: cands };
});
console.log(JSON.stringify(r));
await browser.close();
