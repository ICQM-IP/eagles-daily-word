const ink = '#26374c';
const cream = '#fff0d5';
const honey = '#eab465';
const coral = '#db806b';
const blue = '#6e879e';

function path(ctx, fill, draw, stroke = ink, width = 3.2) {
  ctx.beginPath();
  draw(ctx);
  if (fill) {
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
function oval(ctx, x, y, rx, ry, fill, stroke, tilt = 0) {
  path(ctx, fill, (p) => p.ellipse(x,y,rx,ry,tilt,0,Math.PI*2), stroke ?? null);
}
function spark(ctx, x, y, size) {
  path(ctx, null, (p) => {
    p.moveTo(x-size,y); p.quadraticCurveTo(x,y+1,x+size,y);
    p.moveTo(x,y-size); p.quadraticCurveTo(x+1,y,x,y+size);
  }, honey, 2.8);
}
function shell(ctx, open = false) {
  path(ctx, cream, (p) => {
    p.moveTo(114,113);
    if (open) {
      p.lineTo(129,120); p.lineTo(143,112); p.lineTo(159,124);
      p.lineTo(176,113); p.lineTo(190,120); p.lineTo(205,112);
    } else {
      p.bezierCurveTo(111,79,135,40,159,40);
      p.bezierCurveTo(188,40,211,86,205,112);
    }
    p.bezierCurveTo(200,145,187,153,159,155);
    p.bezierCurveTo(133,155,119,144,114,113);
  });
  oval(ctx,138,133,5,3,honey,null,-.45);
  oval(ctx,175,142,3.3,2,coral);
  oval(ctx,190,131,4,2,honey,null,-.4);
  if (!open) oval(ctx,132,104,3,2,coral,null,-.6);
}
function egg(ctx, cracked) {
  shell(ctx);
  if (!cracked) return;
  path(ctx, ink, (p) => {
    p.moveTo(122,93); p.lineTo(137,99); p.lineTo(148,87); p.lineTo(164,98);
    p.lineTo(175,82); p.lineTo(189,96); p.lineTo(200,87);
    p.lineTo(190,105); p.lineTo(175,110); p.lineTo(157,109); p.lineTo(146,100);
    p.lineTo(134,105);
  }, ink, 2);
  oval(ctx,174,98,8,8,'#fff9e8');
  oval(ctx,176,98,4.4,5,ink);
  oval(ctx,177.3,96.3,1.5,1.5,'#fff');
}
function wings(ctx, stage) {
  const raised = stage >= 5;
  path(ctx, blue, (p) => {
    p.moveTo(151,127); p.bezierCurveTo(120,133,90,122,raised ? 53 : 75,raised ? 69 : 88);
    p.quadraticCurveTo(73,raised ? 69 : 91,91,100);
    p.quadraticCurveTo(87,88,89,84);
    p.quadraticCurveTo(121,86,152,115); p.lineTo(151,127);
  });
  if (stage === 6) {
    path(ctx, blue, (p) => {
      p.moveTo(177,121); p.quadraticCurveTo(201,88,264,69);
      p.quadraticCurveTo(259,89,224,108); p.quadraticCurveTo(249,98,253,103);
      p.quadraticCurveTo(235,132,185,135); p.lineTo(177,121);
    });
  }
}
function chick(ctx, stage) {
  if (stage >= 4) wings(ctx,stage);
  oval(ctx,146,143,12,5,honey,ink,-.2);
  oval(ctx,176,143,12,5,honey,ink,.13);
  oval(ctx,159,117,36,29,stage >= 5 ? '#4e667e' : blue,ink,-.16);
  if (stage < 4) oval(ctx,139,114,15,10,'#58728c',ink,.4);
  path(ctx, cream, (p) => {
    p.moveTo(132,97); p.bezierCurveTo(119,91,118,65,144,55);
    p.quadraticCurveTo(141,44,151,49); p.lineTo(158,52);
    p.quadraticCurveTo(160,42,169,52);
    p.bezierCurveTo(202,58,210,82,200,98);
    p.quadraticCurveTo(194,104,188,106); p.lineTo(181,111); p.lineTo(174,108);
    p.lineTo(168,112); p.quadraticCurveTo(145,109,132,97);
  });
  oval(ctx,144,89,8,4,coral,null,-.17);
  oval(ctx,192,89,7,4,coral,null,.17);
  oval(ctx,151,79,5.3,7,ink);
  oval(ctx,186,79,5.3,7,ink);
  oval(ctx,152.5,76.8,1.6,1.6,'#fff');
  oval(ctx,187.5,76.8,1.6,1.6,'#fff');
  path(ctx, honey, (p) => {
    p.moveTo(161,87); p.quadraticCurveTo(171,80,181,89);
    p.quadraticCurveTo(179,100,171,100); p.lineTo(161,87);
  },ink,2.2);
  if (stage === 2) {
    shell(ctx,true);
    path(ctx, cream, (p) => {
      p.moveTo(133,59); p.quadraticCurveTo(144,37,165,44);
      p.lineTo(171,55); p.lineTo(159,53); p.lineTo(150,61); p.lineTo(144,55); p.lineTo(133,59);
    },ink,2.5);
    oval(ctx,150,49,3,2,honey);
  }
}
function prop(ctx, scene) {
  if (scene === 'letter') {
    ctx.save(); ctx.translate(167,112); ctx.rotate(-.15);
    path(ctx, '#f8d593', (p) => {p.rect(-32,-10,64,39);});
    path(ctx, null, (p) => {p.moveTo(-32,-10); p.lineTo(0,13); p.lineTo(32,-10);});
    oval(ctx,0,13,6.5,6.5,coral,ink);
    ctx.restore();
  } else if (scene === 'nest') {
    path(ctx, '#c88e61',(p) => {
      p.moveTo(103,125); p.quadraticCurveTo(158,147,217,123);
      p.quadraticCurveTo(210,161,159,163); p.quadraticCurveTo(113,161,103,125);
    });
    for (const y of [138,145,151]) path(ctx,null,(p) => {
      p.moveTo(120,y-3); p.quadraticCurveTo(162,y+17,196,y);
    },'#855732',2);
  } else {
    path(ctx, '#fae2ad',(p) => {
      p.moveTo(103,119); p.quadraticCurveTo(133,114,160,128);
      p.quadraticCurveTo(189,114,216,119); p.lineTo(209,148);
      p.quadraticCurveTo(180,147,160,157); p.quadraticCurveTo(138,149,109,149);
    });
    path(ctx,null,(p) => {p.moveTo(160,128); p.lineTo(160,154);},ink,2);
  }
}
export function drawBirds(root) {
  for (const node of root.querySelectorAll('canvas[data-bird]')) {
    const ctx = node.getContext('2d');
    if (!ctx) continue;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const stage = Number(node.dataset.bird);
    const scene = node.dataset.scene;
    oval(ctx,159,158,61,5,'#dcb98138');
    spark(ctx,stage >= 5 ? 76 : 94,61,7);
    spark(ctx,stage >= 5 ? 236 : 223,50,9);
    oval(ctx,218,96,2.5,2.5,coral);
    if (stage <= 1) egg(ctx,stage === 1);
    else chick(ctx,stage);
    if (scene) prop(ctx,scene);
  }
}
