
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let games = {};

function initialBoard() {
  return [
    'r_r','r_h','r_e','r_a','r_g','r_a','r_e','r_h','r_r',
    null,null,null,null,null,null,null,null,null,
    null,'r_c',null,null,null,null,null,'r_c',null,
    'r_s',null,'r_s',null,'r_s',null,'r_s',null,'r_s',
    null,null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,null,
    'b_s',null,'b_s',null,'b_s',null,'b_s',null,'b_s',
    null,'b_c',null,null,null,null,null,'b_c',null,
    null,null,null,null,null,null,null,null,null,
    'b_r','b_h','b_e','b_a','b_g','b_a','b_e','b_h','b_r'
  ];
}

function inside(r,c){ return r>=0 && r<=9 && c>=0 && c<=8; }

function getValidMoves(state, index, player){
  const moves = [];
  const piece = state[index];
  if(!piece || piece[0] !== player) return moves;

  const row = Math.floor(index/9);
  const col = index%9;
  const enemy = player==="r"?"b":"r";

  function add(r,c){
    if(!inside(r,c)) return;
    const i=r*9+c;
    if(!state[i] || state[i][0]!==player) moves.push(i);
  }

  // rook
  if(piece.includes("_r")){
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
      let r=row+dr,c=col+dc;
      while(inside(r,c)){
        let i=r*9+c;
        if(!state[i]) moves.push(i);
        else{
          if(state[i][0]!==player) moves.push(i);
          break;
        }
        r+=dr;c+=dc;
      }
    });
  }

  // horse
  if(piece.includes("_h")){
    const steps=[
      {leg:[-1,0],move:[-2,-1]},{leg:[-1,0],move:[-2,1]},
      {leg:[1,0],move:[2,-1]},{leg:[1,0],move:[2,1]},
      {leg:[0,-1],move:[-1,-2]},{leg:[0,-1],move:[1,-2]},
      {leg:[0,1],move:[-1,2]},{leg:[0,1],move:[1,2]}
    ];
    steps.forEach(s=>{
      let lr=row+s.leg[0], lc=col+s.leg[1];
      if(!inside(lr,lc) || state[lr*9+lc]) return;
      add(row+s.move[0], col+s.move[1]);
    });
  }

  // elephant
  if(piece.includes("_e")){
    [[-2,-2],[-2,2],[2,-2],[2,2]].forEach(([dr,dc])=>{
      let er=row+dr/2, ec=col+dc/2;
      let r=row+dr, c=col+dc;
      if(!inside(r,c) || state[er*9+ec]) return;
      if(player==="r" && r>4) return;
      if(player==="b" && r<5) return;
      add(r,c);
    });
  }

  // advisor
  if(piece.includes("_a")){
    const palace = player==="r"?{r:[0,2],c:[3,5]}:{r:[7,9],c:[3,5]};
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dr,dc])=>{
      let r=row+dr,c=col+dc;
      if(r>=palace.r[0]&&r<=palace.r[1]&&c>=palace.c[0]&&c<=palace.c[1]){
        add(r,c);
      }
    });
  }

  // general
  if(piece.includes("_g")){
    const palace = player==="r"?{r:[0,2],c:[3,5]}:{r:[7,9],c:[3,5]};
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
      let r=row+dr,c=col+dc;
      if(r>=palace.r[0]&&r<=palace.r[1]&&c>=palace.c[0]&&c<=palace.c[1]){
        add(r,c);
      }
    });
  }

  // cannon
  if(piece.includes("_c")){
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr,dc])=>{
      let r=row+dr,c=col+dc;
      let jumped=false;
      while(inside(r,c)){
        let i=r*9+c;
        if(!jumped){
          if(!state[i]) moves.push(i);
          else jumped=true;
        } else {
          if(state[i]){
            if(state[i][0]!==player) moves.push(i);
            break;
          }
        }
        r+=dr;c+=dc;
      }
    });
  }

  // soldier
  if(piece.includes("_s")){
    const dir=player==="r"?1:-1;
    add(row+dir,col);
    if((player==="r"&&row>=5)||(player==="b"&&row<=4)){
      add(row,col-1);
      add(row,col+1);
    }
  }

  return moves;
}

io.on('connection', (socket) => {
  socket.on('createGame', () => {
    const id = uuidv4();
    games[id] = { players:[socket.id], state: initialBoard(), turn:'r' };
    socket.join(id);
    socket.emit('gameCreated', id);
  });

  socket.on('joinGame', (id) => {
    const game = games[id];
    if (!game || game.players.length >= 2) return;
    game.players.push(socket.id);
    socket.join(id);
    io.to(id).emit('startGame', game);
  });

  socket.on('getValidMoves', ({gameId, index})=>{
    const game = games[gameId];
    if(!game) return;
    const moves = getValidMoves(game.state, index, game.turn);
    socket.emit('validMoves', moves);
  });

  socket.on('move', ({id, from, to}) => {
    const game = games[id];
    if (!game) return;

    const valid = getValidMoves(game.state, from, game.turn);
    if(!valid.includes(to)) return;

    game.state[to] = game.state[from];
    game.state[from] = null;
    game.turn = game.turn === 'r' ? 'b' : 'r';

    io.to(id).emit('update', game);
  });
});

server.listen(3000, () => console.log("Running on http://localhost:3000"));
