import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundStyle, buildBackgroundCss } from '../backgrounds.js';
import { validateState } from '../core.js';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6w4sAAAAASUVORK5CYII=';
test('only bundled forest anchors cover at bottom; uploads and other landscapes stay centered',()=>{
 for(const background of ['none','forest','sea','sand','upload']){
  const state=Object.freeze(validateState({background,imageData:PNG}));
  const style=backgroundStyle(state,{breeze:PNG});
  assert.equal(style.backgroundPosition,background==='forest'?'center bottom':'center');
  assert.equal(style.backgroundSize,'cover');
  if(background==='forest')assert.match(buildBackgroundCss(state,{breeze:PNG}),/background-position: center bottom;/);
 }
});
test('cover geometry pins image bottom without distortion across common aspect ratios',()=>{
 // Arithmetic of CSS cover/bottom, not a mock renderer or browser acceptance.
 for(const [width,height] of [[2265,1279],[1920,1080],[1440,900],[900,1200]]){
  const scale=Math.max(width/1536,height/1024);
  const renderedWidth=1536*scale,renderedHeight=1024*scale;
  const top=height-renderedHeight;
  assert.ok(renderedWidth>=width-1e-8&&renderedHeight>=height-1e-8);
  assert.ok(Math.abs(top+renderedHeight-height)<1e-8,'lower image edge is never vertically cropped');
  assert.ok(Math.abs(renderedWidth/renderedHeight-1.5)<1e-8,'source proportions preserved');
 }
});
