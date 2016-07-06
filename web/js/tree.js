
var editor_create,//monaco editor
    editor = {},  //所有的编辑器实例对象
    lg = {}, //支持的语言集合
    h,       //初始化页面高度
    curPath = get_path(), //默认的网站目录
    path_history = [],
    vm, //vue对象
    menuVm, //menu vm
    _id = 0,//每个编辑器id
    pathMap = {}, //一个path=>id的map
    terminals = {},
    contents = {},
    files = { //文件数据结构
        _id : get_id(),
        name: curPath,
        path: curPath,
        type: 'folder',
        open: true,
        children: []
    };

function data_init(curPath){
    files.name = curPath;
    files.path = curPath;
    files.children = [];

    get_file_list(curPath, function (data) {
        files.open = true;
        data.forEach(function (d) {
            files.children.push(d)
        })
    }, 1)
}
//type [success, info, warn, danger]
function show_message(message, type){
    type = type || 'danger';
    vmMessage.content = message;
    vmMessage.type = type;
    vmMessage.show = true;
}

var vmMessage = new Vue({
    el: '#message',
    data: {
        content: 'success',
        type   : 'success',
        show   : false
    }
})


function window_init() {
    h = $(window).height() - 100;
    $('.left').css('height', h);
    $('.right').css('height', h);
    $('.content').css('height', h - 70 - $('.terminal_module').height())
}

function get_path(){
    var path = location.hash;
    if(path.length > 0){
        path = path.substr(1);
    }else if(localStorage.getItem('curPath')){        
        path = localStorage.getItem('curPath');
    }else{
        path = '/'
    }

    localStorage.setItem('curPath', path);

    return path;
}

function get_file_list(path, cb, project) {
    project = project || 0;
    var path = path || '/';
    $.get("/get_file_list?path=" + path + '&project=' + project, cb);
}

function get_path_history() {
    $.get("/get_path_history", function (data) {
        path_history = data;
        $('#filepath').typeahead({
            source: data
        })
    })
}

function get_file_content(path, cb) {
    var path = path || '/';
    $.get("/get_file_content?path=" + path, cb);
}

function render_content(data, type, id) {
    show_editor(data, type, id)
}

function get_id() {
    _id++;
    return '_id_' + _id;
}


function show_editor(content, type, id, readOnly) {
    readOnly = readOnly || false;
    if (editor[id]) {
        vm.oldTab = vm.curTab;
        vm.curTab = id;
        return;
    }
    
    if( content ) {
        contents[id] = content;
        setTimeout( function() {
            editor[ id ] = editor_create( document.getElementById( 'content' + id ), {
                value: content,
                language: lg[ type ],
                theme: 'vs-dark',
                readOnly: readOnly
            });
            editor[ id ].onDidChangeModelContent( function() {
                if(contents[id] == editor[id].model.getValue()){
                    vm.tabs[ id ].save = true;
                }else{
                    vm.tabs[ id ].save = false;
                }
                
            })
            var lis = $('#header li');
            lis.each(function(){
                $(this).css('width', 100/lis.length  + '%');
            })
        }, 50 )
    }

    

}

function close_editor(id) {
    if (editor[id]) {
        if (editor[id].getModel()) {
            editor[id].getModel().dispose();
        }
        editor[id].dispose();
        editor[id] = null;
    }

    var path = vm.$data.tabs[id].path;
    vm.$set('tabs.' + id, null);
    var keys = Object.keys(vm.$data.tabs);

    delete vm.$data.tabs[id];
    delete pathMap[path];
    contents[id] = null;
    delete contents[id];

    var index = keys.indexOf(id);
    if (index != -1 && keys.length > 1) {
        if (index > 0) {
            show_editor(0, 00, keys[index - 1])
        } else {
            show_editor(0, 00, keys[index + 1])
        }

    }


}

function save_file(filepath, content, model) {
    $.post('/save_file', { path: filepath, content: content }, function (data) {
        if (data.errno === 0) {
            model.save = true;
        }
    })
}

function open_file(name, path, id) {
    if (pathMap[path]) {
        vm.oldTab = vm.curTab;
        vm.curTab = pathMap[path];
        return;
    }

    vm.$set('tabs.' + id, {
        _id: id,
        name: name,
        path: path,
        save: true,
        close_show: false
    })
    pathMap[path] = id;
    vm.curTab = id;
    get_file_content(path, function (data) {
        render_content(data, path.substring(path.lastIndexOf('.') + 1), id)
    })
}

Vue.filter('maxlenght', function (value, length) {
    length = parseInt(length, 10);
    if(value.length > length){
        return value.substr(0, length);
    }
    return value;
})

// define the item component
Vue.component('item', {
    template: '#item-template',
    props: {
        model: Object,
        parent: Object
    },
    data: function () {
        return {
            open: this.model.open ? true : false
        }
    },
    computed: {
        isFolder: function () {
            return this.model.type === 'folder'
        }
    },
    methods: {
        toggle: function () {
            if (this.isFolder) {
                this.open = !this.open
                if (this.model.children.length == 0) {
                    render_file_list(this.model.path, this.model.children);
                }
            } else {
                var name = this.model.name;
                var filepath = this.model.path;
                this.model._id = get_id();
                open_file(name, filepath, this.model._id);
            }
        },
        changeType: function (e) {
            e.preventDefault();
            if (!this.isFolder) {
                Vue.set(this.model, 'children', [])
                this.addChild()
                this.open = true
            }
        },
        addChild: function () {
            this.model.children.push({
                name: 'new stuff'
            })
        },
        open_menu: function(e){
            this.model.parent = this.parent;
            menuVm.model = this.model;
            showMenu(this.model.path, this.model.type);
            e.preventDefault();
        }


    }
})

require.config({ paths: { 'vs': 'node_modules/monaco-editor/dev/vs' } });
require(['vs/editor/editor.main'], function () {
    monaco.languages.getLanguages().forEach(function (item) {
        item.aliases.forEach(function (name) {
            lg[name] = item.id;
        })
    })
    console.log(lg)
    editor_create = monaco.editor.create;
});

window_init();

vm = new Vue({
    el: '#tree',
    data: {
        treeData: files,
        tabs: {},
        curTab: '',
        oldTab: '',
        labels: {},
        curLabel: '',
        show_editor: function (id) {
            show_editor(null, null, id);
        },
        close: function (id) {
            if(vm.tabs[id].save){
                return close_editor(id);
            }


            vmCloseFileConfirm.show({
                closeCb:function(){
                    close_editor(id);
                }, 
                saveCb: function(){
                    menu_save_file();
                    close_editor(id);
                }
            })
        },
        add_terminal: function(){
            add_terminal();
        },
        hide_terminal:function(){
            hide_terminal();
        },
        close_terminal: function(){
            console.log(terminals[vm.curLabel])
            terminals[vm.curLabel].socket.close();
            vm.$set('labels.' + vm.curLabel, undefined);
            delete vm.labels[vm.curLabel]
            vm.curLabel = '';
            _.find(vm.labels, function(item, id){
                if(item !== undefined){
                    vm.curLabel = id;
                    return true;
                }
                return false;
            })
            if(vm.curLabel == ''){
                hide_terminal();
            }
        }
    }
})

get_path_history();

render_file_list(curPath, files.children, 1);

function render_file_list( filepath, fileobj , project) {
    get_file_list( filepath, function( data ) {
        files.open = true;        
        if(fileobj.length > 0){
            fileobj.splice(0, fileobj.length);
        }
        data.forEach( function( d ) {
            fileobj.push( d )
        })
    }, project )
}

$(window).resize(function () {
    window_init();
    if (editor[vm.curTab]) {
        editor[vm.curTab].layout();
    }

})

function menu_save_file(){    
    if (editor[vm.curTab] && vm.tabs[vm.curTab].save === false) {
                var content = editor[vm.curTab].model.getValue();
                contents[vm.curTab] = content;
                var path = vm.tabs[vm.curTab].path;
                save_file(path, content, vm.tabs[vm.curTab]);
            }
    }


//ctrl+s save
$(document).keydown(function (e) {
    if (e.ctrlKey == true && e.keyCode == 83) {
        e.preventDefault();
        menu_save_file();
    }
})

$('#save_file').click(function(){
    menu_save_file();
})

//alt + num event
$(document).keydown(function(e){
    if(e.altKey == true ){
        var num = e.keyCode - 49;
        if(num >= 0 ){
            var keys = Object.keys(vm.tabs);
            show_editor(0, 0, keys[num]);
            return false;
        }
        
    }
    
})

$(window).on('hashchange', function () {
    data_init(get_path())    
});

$('#change_path').click(function(){
    location.hash = '#' + $('#filepath').val();
    $('#filepath').val('');
    return false;
})

function showMenu(filepath, filetype){    
    var contextMenu = $("#contextMenu");
    var pageX = event.pageX;//鼠标单击的x坐标
    var pageY = event.pageY;//鼠标单击的y坐标
    var cssObj = {
    top:pageY+"px",//设置菜单离页面上边距离，top等效于y坐标
    left:pageX+"px"//设置菜单离页面左边距离，left等效于x坐标
    };
    menuVm.type  = filetype;
    menuVm.path  = filepath;
    var menuHeight = contextMenu.height();
    var pageHeight = $(window).height();
    if(pageY+ menuHeight >pageHeight){
        cssObj.top = pageHeight - menuHeight - 5 + "px"; //-5是预留右边一点空隙，距离右边太紧不太美观；
    }
    //设置菜单的位置
    $("#contextMenu").css(cssObj).stop().fadeIn(200);//显示使用淡入效果,比如不需要动画可以使用show()替换;
          
}

function hideMenu(){
    $( "#contextMenu" ).stop().fadeOut( 200 );
}


$( document ).on( "mousedown", function( event ) {
    //button等于0代表左键，button等于1代表中键
    if( event.button == 0 || event.button == 1 ) {
       hideMenu();//获取菜单停止动画，进行隐藏使用淡出效果 
    }
});

function api_add_file(filepath, cb){
    $.post('/new_file', {path: filepath}, cb);
}

function api_add_folder(path, cb){
    $.post('/new_folder', {path: path}, cb);
}

function api_del_file(path, cb){
    $.post('/del_file', {path: path}, cb);
}

function api_reanme_file(old_file, new_file, cb){
    $.post('/rename_file', {old: old_file, new: new_file}, cb);
}

menuVm = new Vue({
    el: '#contextMenu',
    data: {
        model: {},
        type: '',
        add: function(type){
            var api_fun = type == 'file' ? api_add_file : api_add_folder;
            var model   = this.model;
            vmFill_text_dialog.show({
                title: type == 'file' ? '创建文件' : '创建目录',
                saveCb: function(new_file_path){
                    api_fun(new_file_path, function(data){
                    if(data.errno === 0){
                        render_file_list(model.path, model.children);
                    }else{
                            show_message(data.errmsg, 'danger');
                        }
                })
                },
                input_text: this.model.path + '/'
            });
        },
        del: function(){
            var model = this.model;
            vmConfirm.show({
                path: model.path,
                saveCb: function(){
                    api_del_file(model.path, function(data){
                        if(data.errno === 0){
                            if(model._id){
                                close_editor(model._id);
                            }
                            render_file_list(model.parent.path, model.parent.children);
                            
                        }else{
                            show_message(data.errmsg, 'danger');
                        }
                    })
                }
            })
        },
        rename: function(){
            var model = this.model;
            var oldPath = model.path;
            var current = model.path.substr(0, model.path.lastIndexOf('/') + 1);
            vmFill_text_dialog.show({
                title: '重命名',
                saveCb: function(new_name){
                    api_reanme_file(oldPath, current + new_name, function(data){
                        if(data.errno === 0){
                            var refresh_path = model.path;
                            var file_obj = model.children;
                            if(model.type == 'file'){
                                refresh_path = model.path.substr(0, model.path.lastIndexOf('/'));
                                file_obj = model.parent.children;
                            }
                            if(model._id){
                                close_editor(model._id);
                            }
                            render_file_list(refresh_path, file_obj)
                        }else{
                            show_message(data.errmsg, 'danger');
                        }
                    })
                },
                input_text: model.name
            })
        },
        refresh: function(){            
            var path = this.model.path;
            render_file_list(path, this.model.children)
        }
    }
})


function add_terminal(){
    var id = get_id();
    vm.$set("labels." +id, true);
    vm.curLabel = id;
    console.log(vm)
    setTimeout(function(){
        terminals[id] =  create_terminal('terminal-container'+id);
    }, 100)
}

function run_terminal(){
    var el = $('#terminal_module');
    if(el.is(":visible")){
        return hide_terminal();
    }
    show_terminal();
    if(vm.curLabel == ''){
        add_terminal();
    }
}

function show_terminal(){
    $('.terminal_module').css('height', '250px');
    $('.terminal_module').show();
    setTimeout(function(){
        window_init();
        if (editor[vm.curTab]) {
            editor[vm.curTab].layout();
        }
    }, 100)
    
}

function hide_terminal(){
    $('.terminal_module').hide();
    $('.terminal_module').css('height', '0');
    window_init();
    if (editor[vm.curTab]) {
        editor[vm.curTab].layout();
    }
}

$('#run_terminal').click(function(){
    run_terminal()
})

//ctrl+` run terminal
$(document).keydown(function (e) {
    if (e.ctrlKey == true && e.keyCode == 192) {
        e.preventDefault();
        run_terminal();
    }
})


function create_terminal(el) {
    var term,
    protocol,
    socketURL,
    socket;

var terminalContainer = document.getElementById(el);


createTerminal();

return {
    socket: socket,
    term  : term
}


function createTerminal() {
  while (terminalContainer.children.length) {
    terminalContainer.removeChild(terminalContainer.children[0]);
  }
  term = new Terminal();
  setTimeout(function(){
      runFakeTerminal()
  }, 3000)
  console.log(term)
  protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
  socketURL = protocol + location.hostname + ((location.port) ? (':' + location.port) : '') + '/bash';
  socket = new WebSocket(socketURL);

  term.open(terminalContainer);
  term.fit();

  socket.onopen = runRealTerminal;
  socket.onclose = runFakeTerminal;
  socket.onerror = runFakeTerminal;
}


function runRealTerminal() {
  term.attach(socket);
  term._initialized = true;
}

function runFakeTerminal() {
  if (term._initialized) {
    return;
  }

  term._initialized = true;

  var shellprompt = '$ ';

  term.prompt = function () {
    term.write('\r\n' + shellprompt);
  };

  term.writeln('Welcome to xterm.js');
  term.writeln('This is a local terminal emulation, without a real terminal in the back-end.');
  term.writeln('Type some keys and commands to play around.');
  term.writeln('');
  term.prompt();

  term.on('key', function (key, ev) {
    var printable = (
      !ev.altKey && !ev.altGraphKey && !ev.ctrlKey && !ev.metaKey
    );

    if (ev.keyCode == 13) {
      term.prompt();
    } else if (ev.keyCode == 8) {
      /*
     * Do not delete the prompt
     */
      if (term.x > 2) {
        term.write('\b \b');
      }
    } else if (printable) {
      term.write(key);
    }
  });

  term.on('paste', function (data, ev) {
    term.write(data);
  });
}

}

var close_file_confirm = $('#close_file_confirm')
var vmCloseFileConfirm = new Vue({
    el: '#close_file_confirm',
    data: {
        title: 'Confirm',
        content: '此文件未保存,确认关闭?',
        closeCb: function(){},
        saveCb: function(){},
        show: function(cb){
            close_file_confirm.modal('show');
            this.closeCb = cb.closeCb;
            this.saveCb = cb.saveCb;
        },
        close: function(){
            var cb = this.closeCb;
            if(_.isFunction(cb)){
                cb()
            }
            close_file_confirm.modal('hide');
        },
        save: function(){
            var cb = this.saveCb;
            if(_.isFunction(cb)){
                cb()
            }
            close_file_confirm.modal('hide');
        },
        hide: function(){
            close_file_confirm.modal('hide');
        }
    }
})

var fill_text_dialog = $('#fill_text_dialog')
var vmFill_text_dialog = new Vue({
    el: '#fill_text_dialog',
    data: {
        title: 'Confirm',
        input_text: '',
        saveCb: function(){},
        show: function(obj){
            fill_text_dialog.modal('show');
            this.title = obj.title;
            this.saveCb = obj.saveCb;
            this.input_text = obj.input_text;
        },
        save: function(){
            var cb = this.saveCb;
            if(_.isFunction(cb)){
                cb(this.input_text);
            }
            fill_text_dialog.modal('hide');
        },
        hide: function(){
            fill_text_dialog.modal('hide');
        }
    }
})

var el_confirm = $('#confirm')
var vmConfirm = new Vue({
    el: '#confirm',
    data: {
        title: 'Confirm',
        content: '确认删除此文件?',
        closeCb: function(){},
        saveCb: function(){},
        ok_msg: '',
        cancel_msg: '',
        show: function(obj){
            el_confirm.modal('show');
            this.content = "确认删除此文件(" + obj.path + ")?";
            this.ok_msg = obj.ok_msg || 'Ok';
            this.cancel_msg = obj.cancel_msg || 'Cancel';            
            this.saveCb = obj.saveCb;
        },
        save: function(){
            var cb = this.saveCb;
            if(_.isFunction(cb)){
                cb()
            }
            el_confirm.modal('hide');
        },
        hide: function(){
            el_confirm.modal('hide');
        }
    }
})





