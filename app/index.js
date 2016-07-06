'use strict';
var express = require('express');
var fs      = require('fs');
var path    = require('path');
var app = express();
var expressWs = require('express-ws')(app);
var os = require('os');
var pty = require('pty.js');
var _   = require('underscore');
var spawn = require('child_process').spawn;
var bodyParser = require('body-parser');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
const low = require('lowdb')
const fileAsync = require('lowdb/lib/file-async')
const db = low('db.json', {
  storage: fileAsync
})

db.defaults({ paths: [] })
  .value()

const pathTable = db.get('paths');
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()); // for parsing application/json

app.all("/get_path_history", (req, res) => {
    var data = _.map(pathTable.value(), (dd) => {
        return dd.path
    });
    res.send(data)
})

app.all("/get_file_list", (req, res) =>{
    var opendir = req.query.path || '/';
    var project = req.query.project || 0;
    
    var curPath = path.resolve(opendir);
    if (project == 1 && pathTable.find({ path: curPath }).value() === undefined) {
        pathTable.push({
            path: curPath
        }).value()
    }

    var files = fs.readdirSync(curPath);
    var name = path.basename(curPath) == '' ? '/' : path.basename(curPath);
    var arrPath = [], arrFile = [];
    var type;
    _.each(files, (file) => {
        var filePath;
        if(curPath == '/'){
            filePath = curPath + file;
        }else{
            filePath = curPath + '/' + file
        }
        var stat = fs.statSync(filePath);
        if(stat.isDirectory()){
            arrPath.push({
                name: file,
                type: 'folder',
                path: filePath,
                children: []
            })
        }else{
            arrFile.push({
                name: file,
                type: 'file',
                path: filePath,
                children: []
            })
        }
    })

    res.send(arrPath.concat(arrFile));
})

app.all('/get_file_content', (req, res)=> {
    var filepath = req.query.path || '/';
    var curPath = path.resolve(filepath);
    var stat = fs.statSync(filepath);

    if(stat.isDirectory()){
        return res.send('');
    }
    
    var content = fs.readFileSync(filepath);
    res.send(content)
    //res.sendFile(filepath);
    
})

app.post('/save_file', upload.array(),(req, res)=>{

    var filepath = req.body.path;
    var content  = req.body.content;
    try{
         fs.writeFileSync(filepath, content)
         res.send({
             errno: 0,
             errmsg: 'success'
         })
    }catch(err){        
        res.send({
            errno: err.errno,
            errmsg: err.message
        })
    }
})

app.post('/del_file', upload.array(), (req, res)=>{
    var filepath = req.body.path;
    try{
        fs.unlinkSync(filepath);
        res.send({
            errno: 0,
            errmsg: 'success'
        })
    }catch(err){
        res.send({
            errno: err.errno,
            errmsg: err.message
        })
    }
})

app.post('/new_file', upload.array(), (req, res)=>{
    var filepath = req.body.path;
    if(fs.existsSync(filepath)){
        res.send({
            errno: 100,
            errmsg: 'File exist.'
        })
    }
    try{
        fs.appendFileSync(filepath, "");
        res.send({
            errno: 0,
            errmsg: 'success'
        })
    }catch(err){
        res.send({
            errno: err.errno,
            errmsg: err.message
        })
    }
})

app.post('/new_folder', upload.array(), (req, res)=>{
    var filepath = req.body.path;
    try{
        fs.mkdirSync(filepath);
        res.send({
            errno: 0,
            errmsg: 'success'
        })
    }catch(err){
        res.send({
            errno: err.errno, 
            errmsg: err.message
        })
    }
})

app.post('/rename_file', upload.array(), (req, res)=>{
    var oldPath = req.body.old;
    var newPath = req.body.new;
    try{
        fs.renameSync(oldPath, newPath);
        res.send({
            errno: 0,
            errmsg: 'success'
        })
    }catch(err){
        res.send({
            errno: err.errno,
            errmsg: err.message
        })
    }

})

//web ws
app.ws('/bash', function(ws, req) {
  /**
   * Open bash terminal and attach it
   */
  var term = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : 'bash', [], {
    name: 'xterm-color',
    cols: 100,
    rows: 10,
    cwd: process.env.PWD,
    env: process.env
  });

  term.on('data', function(data) {
    try {
      ws.send(data);
    } catch (ex) {
      // The WebSocket is not open, ignore
    }
  });
  ws.on('message', function(msg) {
    term.write(msg);
  });
  ws.on('close', function () {
    console.log('close');
    console.log(term.pid);
    process.kill(term.pid, 'SIGHUP');
  });
});


//web frontend
app.use(express.static('../web'));
app.use('/bower_components', express.static('../bower_components'));
app.use('/node_modules', express.static('../node_modules'));

app.listen(8888);
