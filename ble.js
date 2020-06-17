//nohup node index.js;
const axios = require("axios");
const EventSource = require('eventsource');
const { exec } = require('child_process');
const fs = require('fs');
module.exports = {
    getToken:function(utils){
        return new Promise(function(resolve, reject) {
            try {
                var Headers = {
                    "Authorization":"Basic c3BhY2VzZW5zZTowMGFhZmYwNDliMWQwZTUx"
                }
                var data = { "grant_type": "client_credentials"};
                axios.post("http://"+utils.serverip+"/api/oauth2/token",data,{headers:Headers})
                .then((response)=>{
                    resolve(response.data)
                })
                .catch((error)=>{
                    reject(error.response.data);
                });
            } catch (error) {
                reject(error.toString());
            }
        });
    },
    connectBLE:function(utils){
        return new Promise(function(resolve,reject){
            try {
                var Headers = {
                    "Authorization":"Bearer "+utils.servertoken,
                    "Accept":"application/json",
                    "Accept-Language":"en_US"
                }
                var URL = "http://10.10.10.254/gap/nodes/"+utils.serverble+"/connection?mac="+utils.servermac;
                axios.post(URL,{},{headers:Headers})
                .then((response)=>{
                    resolve(response.data)
                })
                .catch((error)=>{
                    reject(error.response.data);
                });
            } catch (error) {
                reject(error.toString());
            }
        });
    },
    setNotify:function(utils){
        return new Promise(function(resolve,reject){
            try {
                var Headers = {
                    "Authorization":"Bearer "+utils.servertoken,
                    "Accept":"application/json",
                    "Accept-Language":"en_US"
                }
                var URL = "http://10.10.10.254/gatt/nodes/"+utils.serverble+"/handle/14/value/0100/?mac="+utils.servermac;
                axios.get(URL,{headers:Headers})
                .then((response)=>{
                    resolve(response.data)
                })
                .catch((error)=>{
                    reject(error.response.data);
                });
            } catch (error) {
                reject(error.toString());
            }
        });
    },
    datacollectGetMissingPkt:function(utils){
        return new Promise(function(resolve,reject){
            try {
                var URL = 'http://10.10.10.254/gatt/nodes/?mac='+utils.servermac+'&event=1&access_token='+utils.servertoken;
                var es = new EventSource(URL);
                var CallInt = null,CallInt1 = null;
                var StopCond = 0,start = 0,disconnected=false;
                var i = 1,l=0,Temp = 0,failCnt=0,fstate = "",faild = null;
                var missingPackets = [],mpkts = utils.missingPktList,datas=[];
                function ConvertPktHex(){
                    for (let index = 0; index < mpkts.length; index++) {
                        const packet = mpkts[index];
                        var ConvPacket = decimalToHexString(packet);
                        ConvPacket = addzero(ConvPacket,6);
                        var Fres = "535254"+ConvPacket.substr(4,6)+""+
                                   ConvPacket.substr(2,4)+""+ConvPacket.substr(0,2)+"11";
                        missingPackets.push(Fres);
                    }
                }
                function addzero(s,size) {
                    while (s.length < (size || 2)) {s = "0" + s;}
                    return s;
                }
                function decimalToHexString(number){
                    number = parseInt(number);
                    if (number < 0){ number = 0xFFFFFFFF + number + 1;}
                    return number.toString(16).toUpperCase();
                }
                ConvertPktHex();
                var cmd = missingPackets[l];
                l = l + 1;
                setTimeout(function() {
                    WriteBLE(cmd).then(data=>{}).catch(err=>{});
                    checkTime(i);
                }, 2000);
                es.onmessage = function(e) {
                    if (e.data != '') {
                        if (Temp != 1) {
                            var JSONObj = JSON.parse(e.data);
                            var value = JSONObj.value;
                            if (value != '') {
                                if (i == 1) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() != 'SNKV') {
                                        failCnt = 0;
                                        console.log(e.data);
                                    } else {
                                        failCnt=failCnt+1;
                                        console.log('Issue on getting the missing packet : '+cmd);
                                        if (failCnt==3){
                                            StopCond = 1;
                                            es.close();
                                            makedisconnect('Issue on getting the missing packet : '+cmd,true);
                                            return;
                                        }
                                    }
                                    if (missingPackets.length == l) {
                                        start = 2;
                                        StopCond = 1;
                                    } else {
                                    StopCond = 1;
                                    i = i + 1;
                                    cmd = missingPackets[l];
                                    l = l + 1;
                                    setTimeout(function() {
                                        WriteBLE(cmd).then(data=>{}).catch(err=>{});
                                        checkTime(i);
                                    }, 2000);
                                    }
                                } else if (i == 2) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() != 'SNKV') {
                                        failCnt = 0;
                                        datas.push(e.data);
                                    } else {
                                        failCnt=failCnt+1;
                                        console.log('Issue on getting the missing packet : '+cmd);
                                        if (failCnt==3){
                                            StopCond = 1;
                                            es.close();
                                            makedisconnect('Issue on getting the missing packet : '+cmd,true);
                                            return;
                                        }
                                    }
                                    if (missingPackets.length == l) {
                                        start = 2;
                                        StopCond = 1;
                                    } else {
                                        StopCond = 1;
                                        cmd = missingPackets[l];
                                        l = l + 1;
                                        setTimeout(function() {
                                            WriteBLE(cmd).then(data=>{}).catch(err=>{});
                                            checkTime(i);
                                        }, 2000);
                                    }
                                }
                            }
                        }
                    }
                    if (start == 2) {
                        es.close();
                        makedisconnect("Successfull",false);
                        return;
                    }
                };
                es.onerror = function(e) {
                    makedisconnect("Error on getting missing packets : "+e.toString());
                    console.log('Error:' + e.status);
                };
                function checkTime(i) {
                    var StartTime = new Date().getTime();
                    CallInt = setInterval(function() {
                        var EndTime = new Date().getTime();
                        if(disconnected){
                            clearInterval(CallInt);
                            return;
                        }else if (StopCond == 1) {
                            StopCond = 0;
                            clearInterval(CallInt);
                        } else {
                            if ((EndTime - StartTime) > 5000) {
                                failCnt = failCnt + 1;
                                console.log('Issue on getting the missing packet - 1 : '+cmd);
                                i = 2;
                                if ((missingPackets.length == l)||(failCnt==3)){
                                    start = 2;
                                    es.close();
                                    makedisconnect("Issue on getting the missing packet",true);
                                } else {
                                    //StopCond = 1;
                                    cmd = missingPackets[l];
                                    l = l + 1;
                                    setTimeout(function() {
                                        WriteBLE(cmd).then(data=>{}).catch(err=>{});
                                        checkTime(i);
                                    }, 2000);
                                }
                                clearInterval(CallInt);
                                return;
                            }
                        }
                    }, 1000)
                }
                function hex2a(hexx) {
                    var hex = hexx.toString();
                    var str = '';
                    for (var i = 0;
                        (i < hex.length && hex.substr(i, 2) !== '00'); i += 2)
                        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                    return str;
                }
                function DisConnect(){
                    var temp_fstate = fstate;
                    var temp_faild = faild;
                    es.close();
                    clearInterval(CallInt);
                    clearInterval(CallInt1);
                    var time = 1000;
                    console.log("Preparing Disconnect..");                    
                    setTimeout(() => {
                        var wbleURL = 'http://10.10.10.254/gap/nodes/'+utils.serverble+'/connection?mac=' + utils.servermac;
                        axios.delete(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                        .then((data)=>{
                            console.log("Disconnected : ",data.data);
                            resolve({status:temp_faild,msg:temp_fstate,data:datas});
                        })
                        .catch((data)=>{
                            console.log("Disconnected Err : ",data.response.data);
                            resolve({status:temp_faild,msg:temp_fstate,data:datas});
                        })
                    }, time);
                }
                function makedisconnect(msg, val){
                    disconnected = true;
                    attemptLimit = 0; faild = val; fstate = msg;
                    console.log(fstate);
                    DisConnect();
                }

                function WriteBLE(cmd_now,taketime = 0){
                    return new Promise((resolve,reject)=>{
                        is_have_response = false;
                        setTimeout(() => {
                            var wbleURL = 'http://10.10.10.254/gatt/nodes/'+utils.serverble+'/handle/17/value/' + cmd_now + '/?chip=1&mac=' + utils.servermac;
                            axios.get(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                            .then((data)=>{resolve(data);})
                            .catch((data)=>{reject(data);})
                        }, taketime);
                    });
                }
            } catch (error) {
                resolve({status:true,msg:error.toString(),data:[]});
            }
        });
    },
    datacollectBLE:function(utils){
        return new Promise(function(resolve,reject){
            try {
                function getSample(key){
                    let val = {
                        "30000":"3075","25000":"A861","20000":"204E","15000":"983A",
                        "10000":"1027","5000":"8813"
                    }
                    return "534453"+(val[key]?val[key]:"3075")+"0001";
                }
                function getSampleRate(key){
                    let val = { "5000":"0","2500":"1","1250":"2","625":"3" }
                    return "5352530"+(val[key]?val[key]:"0")+"52";
                }
                var EventSource = require('eventsource');
                var URL = 'http://10.10.10.254/gatt/nodes/?mac='+utils.servermac+'&event=1&access_token='+utils.servertoken;
                var es = new EventSource(URL);
                var StopCond = 0,start = 0,i = 1,CallInt1=null,CallInt=null,disconnected = false;;
                var Temp = 0,cmd = '5AA6',fstate = "",faild = false,datas = [];
                setTimeout(function() {
                    console.log("Ping => ",cmd);
                    WriteBLE(cmd).then(data=>{}).catch(err=>{});
                    checkTime(i);
                }, 2000);
                es.onmessage = function(e) {
                    if (e.data != '') {
                        if (Temp != 1) {
                            var JSONObj = JSON.parse(e.data)
                            var value = JSONObj.value;
                            console.log("Response : "+value);
                            if (value != '') {
                                if (i == 1) {
                                    var ResAscii = hex2a(value);
                                    if ((ResAscii.toUpperCase() == 'AWAKE') || (value.toUpperCase() == '5AA7000201500000AAEA') || (value.toUpperCase() == '534E4B56')) {
                                        StopCond = 1;
                                        i = i + 1;
                                        //Call set clock
                                        cmd = '5343530603E40708213187';
                                        setTimeout(function() {
                                            console.log("Set Clock => ",cmd);
                                            WriteBLE(cmd)
                                            .then(data=>{})
                                            .catch(err=>{});
                                            checkTime(i);
                                        }, 2000);
                                    } else {
                                        makedisconnect('BLE wakeup is failed ' + ResAscii.toUpperCase() + '||' + value.toUpperCase(),true);
                                        es.close();
                                        return;
                                    }
                                } else if (i == 2) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() == 'SAKY') {
                                        StopCond = 1;
                                        i = i + 1;
                                        //Scan Duration
                                        cmd = getSample(utils.currentrequest.noofsamples);
                                        setTimeout(function() {
                                            console.log("Scan Duration => ",cmd);
                                            WriteBLE(cmd).then(data=>{})
                                            .catch(err=>{});
                                            checkTime(i);
                                        }, 2000);
                                    } else {
                                        makedisconnect('Clock Set is failed',true);
                                        es.close();
                                        return;
                                    }
                                } else if (i == 3) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() == 'SAKY') {
                                        StopCond = 1;
                                        i = i + 1;
                                        //Sample Rate select
                                        cmd = getSampleRate(utils.currentrequest.samplerate);
                                        setTimeout(function() {
                                            console.log("Sample Rate => ",cmd);
                                            WriteBLE(cmd).then(data=>{})
                                            .catch(err=>{});
                                            checkTime(i);
                                        }, 2000);
                                    } else {
                                        makedisconnect('Scan duration set is failed',true);
                                        es.close();
                                        return;
                                    }
                                } else if (i == 4) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() == 'SAKY') {
                                        StopCond = 1;
                                        i = i + 1;
                                        //Call Data request
                                        cmd = '53445245';
                                        setTimeout(function() {
                                            console.log("Data Request => ",cmd);
                                            WriteBLE(cmd).then(data=>{})
                                            .catch(err=>{});
                                            checkTime(i);
                                        }, 2000);
                                    } else {
                                        makedisconnect('Sample rate select is failed',true);
                                        es.close();
                                        return;
                                    }
                                } else if (i == 5) {
                                    var ResAscii = hex2a(value);
                                    if (ResAscii.toUpperCase() != 'SAKY') {
                                        makedisconnect('Error while request the data',true);
                                        es.close();
                                        return;
                                    }
                                    StopCond = 1;
                                    setTimeout(function() {
                                        checkTime2();
                                    }, 2000);
                                    Temp = 1;
                                }
                            }
                        }
                        if (e.data.includes('6161616161') || (e.data.includes('7A7A7A7A7A'))) {
                            start += 1;
                        }
                        if (start == 1) {
                            if (StopCond == 0) {
                                checkTime2();
                            }
                            StopCond = 1;
                            var JSONObj = JSON.parse(e.data);
                            datas.push(JSONObj);
                            console.log();
                            console.log(JSONObj);
                        }
                        if (start == 2) {
                            StopCond = 1;
                            clearInterval(CallInt);
                            clearInterval(CallInt1);
                            var JSONObj = JSON.parse(e.data);
                            datas.push(JSONObj);
                            console.log();
                            console.log(JSONObj);
                            es.close();
                            makedisconnect("success",false);
                            return;
                        }
                    }
                };
                es.onerror = function(e) {
                    makedisconnect("Error in datacollction (onerror)",true);
                };

                function hex2a(hexx) {
                    var hex = hexx.toString(); //force conversion
                    var str = '';
                    for (var i = 0;
                        (i < hex.length && hex.substr(i, 2) !== '00'); i += 2)
                        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                    return str;
                }

                function WriteBLE(cmd_now,taketime = 0){
                    return new Promise((resolve,reject)=>{
                        is_have_response = false;
                        setTimeout(() => {
                            var wbleURL = 'http://10.10.10.254/gatt/nodes/'+utils.serverble+'/handle/17/value/' + cmd_now + '/?chip=1&mac=' + utils.servermac;
                            axios.get(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                            .then((data)=>{resolve(data);})
                            .catch((data)=>{reject(data);})
                        }, taketime);
                    });
                }

                function checkTime(i) {
                    var StartTime = new Date().getTime();
                    CallInt = setInterval(function() {
                        var EndTime = new Date().getTime();
                        if (StopCond == 1) {
                            StopCond = 0;
                            clearInterval(CallInt);
                        } else {
                            if(disconnected){
                                clearInterval(CallInt);
                                return;
                            }else if ((EndTime - StartTime) > 5000) {
                                clearInterval(CallInt);
                                if (i == 1) {
                                    makedisconnect('BLE wakeup is failed',true);
                                } else if (i == 2) {
                                    makedisconnect('Clock Set is failed',true);
                                } else if (i == 3) {
                                    makedisconnect('Scan duration set is failed',true);
                                } else if (i == 4) {
                                    makedisconnect('Sample rate select is failed',true);
                                } else {
                                    makedisconnect('Error while request the data',true);
                                }
                                return;
                            }
                        }
                    }, 1000)
                }

                function DisConnect(){
                    var temp_fstate = fstate;
                    var temp_faild = faild;
                    es.close();
                    clearInterval(CallInt);
                    clearInterval(CallInt1);
                    var time = 1000;
                    console.log("Preparing Disconnect..");                    
                    setTimeout(() => {
                        var wbleURL = 'http://10.10.10.254/gap/nodes/'+utils.serverble+'/connection?mac=' + utils.servermac;
                        axios.delete(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                        .then((data)=>{
                            console.log("Disconnected : ",data.data);
                            resolve({status:temp_faild,msg:temp_fstate,data:datas});
                        })
                        .catch((data)=>{
                            console.log("Disconnected Err : ",data.response.data);
                            resolve({status:temp_faild,msg:temp_fstate,data:datas});
                        })
                    }, time);
                }
                function makedisconnect(msg, val){
                    disconnected = true;
                    attemptLimit = 0; faild = val; fstate = msg;
                    console.log(fstate);
                    DisConnect();
                }

                function checkTime2() {
                    var StartTime = new Date().getTime();
                    CallInt1 = setInterval(function() {
                        var EndTime = new Date().getTime();
                        if (StopCond == 1) {
                            StopCond = 0;
                            clearInterval(CallInt1);
                        } else {
                            if(disconnected){
                                clearInterval(CallInt1);
                                return;
                            }else if ((EndTime - StartTime) > 80000) {
                                clearInterval(CallInt1);
                                makedisconnect('Issue on data collection',true);
                                es.close();
                                return;
                            }
                            console.log("Waiting for resposnse....");
                        }
                    }, 1000);
                }
            } catch (error) {
                resolve({status:true,msg:error.toString(),data:[]});
            }
        });
    },
    upgradeBLE:function(utils){
        return new Promise(function(resolve,reject){
            try{
                var URL = 'http://10.10.10.254/gatt/nodes/?mac='+utils.servermac+'&event=1&access_token='+utils.servertoken;
                var es = new EventSource(URL);
                var current_line = 0;
                var faild = true;var fstate="";
                var is_have_response = false, is_response = "";
                var cmdmode = null, attemptLimit=0,reconnect_atmt = 0;
                var Cmds = '5AA6,534231303132333435363738394142434445464B,5AA6,5AA40400CF320D00CC00,5AA40C00F724020000020000000000500000,5AA40C00BE27040100020000000044410000,5AA52000BCD900000320450F0000910F0000950F00008D0F00008D0F00008D0F000000000000';
                var resetCmds='5AA404006F460B000000,5AA1';
                var getPropCmd='5AA40C000F79070000020700000024010000';
                var resetCmdsList=resetCmds.split(',');
                var total_attempt = 10,timer = null;
                var progLines = [],progLinesCnt = 0;
                function readProgram(){
                    progLines = fs.readFileSync(utils.serverfile).toString().split('\n');
                }
                function DisConnect(){
                    var temp_fstate = fstate;
                    var temp_faild = faild;
                    disconnecting = true;
                    es.close();
                    var time = (cmdmode == "RESET" || (cmdmode == "GET_PROPERTY") || (cmdmode == "FINAL_CMD"))?360000:0;
                    console.log("Preparing Disconnect..");                    
                    setTimeout(() => {
                        var wbleURL = 'http://10.10.10.254/gap/nodes/'+utils.serverble+'/connection?mac=' + utils.servermac;
                        axios.delete(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                        .then((data)=>{
                            console.log("Disconnected : ",data.data);
                            resolve([temp_faild,temp_fstate]);
                        })
                        .catch((data)=>{
                            console.log("Disconnected Err : ",data.response.data);
                            resolve([temp_faild,temp_fstate,[]]);
                        })
                    }, time);
                }
                function hex2a(hexx) {
                    var hex = hexx.toString();
                    var str = '';
                    for (var hexi = 0;
                        (hexi < hex.length && hex.substr(hexi, 2) !== '00'); hexi += 2)
                        str += String.fromCharCode(parseInt(hex.substr(hexi, 2), 16));
                    return str;
                }
                function makedisconnect(msg, val){
                    attemptLimit = 0; faild = val; fstate = msg;
                    console.log(fstate);
                    DisConnect();
                }
                function run(){
                    var StartTime = new Date().getTime();
                    timer = setInterval(function() {
                        var EndTime = new Date().getTime();
                        if(!is_have_response && ((EndTime - StartTime) < 20000)) {return;}
                        clearInterval(timer);
                        if(is_have_response){
                            var value = is_response;
                            var ResAscii = hex2a(value);
                            attemptLimit = 0;
                            if(cmdmode == "PING"){
                                cmdmode =  "ANOTHHER_PING";
                                console.log("Another Ping => 5AA6");
                                WriteBLE("5AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(cmdmode == "RETRY_CONNECTED" && (value.includes("5AA35AA40C"))){
                                console.log("Send 5AA1");
                                WriteBLE("5AA1")
                                .then((data)=>{})
                                .catch((data)=>{});
                                console.log("Ping => 5AA6");
                                cmdmode = "PING";
                                WriteBLE("5AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(value.includes("534E4B59")){
                                cmdmode = "SB10123456789ABCDEFK";
                                console.log("CMD MODE CHANGE : SB10123456789ABCDEFK");
                                WriteBLE("SB10123456789ABCDEFK")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(value == "5AA15AA40C005481A0000002000000000D000000" && (cmdmode == "PING")){
                                cmdmode = "INCLUDE_5AA15AA40C005481A0000002000000000D000000";
                                makedisconnect("INCLUDE_5AA15AA40C005481A0000002000000000D000000 FOR PING",true);
                            }else if (ResAscii == 'AWAKE' || (value == "534E4B56")) {
                                console.log('change  to BootLoad => 534231303132333435363738394142434445464B');
                                cmdmode = "CHANGE_TO_BOOTLOADER_MODE";
                                WriteBLE("534231303132333435363738394142434445464B")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(value == '5AA7000201500000AAEA'){
                                console.log('Already in boot mode');
                                console.log('Before Erase unsecure region => 5AA1');
                                WriteBLE("5AA1")
                                .then((data)=>{})
                                .catch((data)=>{});
                                console.log('Erase unsecure region => 5AA40400CF320D00CC00');
                                cmdmode = "ERASE_UNSECURE_REGION";
                                WriteBLE("5AA40400CF320D00CC00")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(ResAscii == 'SAKY'){
                                console.log('Ping to confirm bootloader => 5AA6');
                                cmdmode = "PING_TO_CONFIRM_BOOTLOADER_MODE";
                                WriteBLE("5AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if (value == '5AA15AA40C005481A0000002000000000D000000') {
                                console.log('Before erase => 5AA1');
                                WriteBLE('5AA1')
                                .then((data)=>{})
                                .catch((data)=>{});
                                console.log('Erase region => 5AA40C00F724020000020000000000500000');
                                cmdmode = "ERASE_REGION";
                                WriteBLE("5AA40C00F724020000020000000000500000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(value == '5AA15AA40C00BA55A00000020000000002000000'){
                                console.log('Before write => 5AA1');
                                WriteBLE('5AA1')
                                .then((data)=>{})
                                .catch((data)=>{});
                                console.log('Write command => 5AA40C001BBD0401000200000000043E0000');
                                cmdmode = "WRITE";
                                WriteBLE("5AA40C001BBD0401000200000000043E0000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(cmdmode == "SB10123456789ABCDEFK" || (value == "5AA15AA40C002372A00000020000000004000000" && (cmdmode == "WRITE"))){
                                console.log('Before Program => 5AA1');
                                WriteBLE('5AA1')
                                .then((data)=>{})
                                .catch((data)=>{});
                                progLinesCnt = 0;
                                cmdmode = "PROGRAM_LINE_"+progLinesCnt;
                                var f_line = progLines[progLinesCnt].toUpperCase().trim();
                                wbleresponse = 0;
                                progLinesCnt += 1;
                                console.log("Program Line => "+progLinesCnt,f_line);
                                WriteBLE(f_line)
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }
                            else if((value == "5AA1" || value == "5AA15AA40C002372A00000020000000004000000") && (cmdmode.includes("PROGRAM_LINE"))){
                                if(progLinesCnt >= progLines.length){
                                    console.log("Successfully completed!!!");
                                    faild=false;
                                    cmdmode = "GET_PROPERTY";
                                    console.log('Get-Property : 5AA40C004B33070000020100000000000000');
                                    WriteBLE("5AA40C004B33070000020100000000000000")
                                    .then((data)=>{ run(); })
                                    .catch((data)=>{ run(); });
                                }else{
                                    if(progLinesCnt == progLines.length && (value == "5AA1")){
                                        makedisconnect("Failed for last packet response 5AA1");
                                    }else{
                                        cmdmode = "PROGRAM_LINE_"+progLinesCnt;
                                        var f_line = progLines[progLinesCnt].toUpperCase().trim();
                                        progLinesCnt += 1;
                                        console.log("Program Line => "+progLinesCnt+" : ",f_line);
                                        wbleresponse = 0;
                                        WriteBLE(f_line)
                                        .then((data)=>{ run(); })
                                        .catch((data)=>{ run(); });
                                    }
                                }                                        
                            }else if(cmdmode == "GET_PROPERTY" && (value.includes("5AA15AA40C"))){
                                console.log('Before reset : 5AA1');
                                WriteBLE('5AA1')
                                .then((data)=>{})
                                .catch((data)=>{});
                                cmdmode = "RESET";
                                console.log('Reset : 5AA404006F460B000000');
                                WriteBLE('5AA404006F460B000000')
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }else if(cmdmode == "GET_PROPERTY" && (value.includes("5AA35AA40C"))){
                                makedisconnect("Get Property Failed with response 5AA3",true);
                            }
                            else if(cmdmode == "RESET"){
                                cmdmode = "FINAL_CMD";
                                console.log('Final command => 5AA1');
                                WriteBLE("5AA1")
                                .then((data)=>{ DisConnect(); })
                                .catch((data)=>{ DisConnect(); });
                            }else if((cmdmode == "PING" || (cmdmode == "ANOTHHER_PING")) && (value == "5AA7000201500000AAEA5AA35AA40C0050F0A00000021327000004000000")){                        
                                console.log("Changing mode by sending 5AA1 and 5AA6");                        
                                WriteBLE("5AA1")
                                .then((data)=>{})
                                .catch((data)=>{});
                                setTimeout(() => {
                                    WriteBLE("5AA6")
                                    .then((data)=>{ run(); })
                                    .catch((data)=>{ run(); });
                                }, 5000);
                            }else if(cmdmode == "PING"){
                                cmdmode = "ERROR";
                                console.log('BLE wakeup is failed - Unexpected Response');
                                makedisconnect('BLE wakeup is failed - Unexpected Response '+value,true);
                            }else if(cmdmode == "CHANGE_TO_BOOTLOADER_MODE"){
                                cmdmode = "ERROR";
                                console.log('BLE not changing to Bootloader mode - Unexpected Response');
                                makedisconnect('BLE not changing to Bootloader mode - Unexpected Response '+value,true);
                            }else if(cmdmode == "PING_TO_CONFIRM_BOOTLOADER_MODE"){
                                cmdmode = "ERROR";
                                console.log('BLE not in Bootloader mode - Unexpected Response');
                                makedisconnect('BLE not in Bootloader mode - Unexpected Response '+value,true);
                            }else if(cmdmode == "ERASE_UNSECURE_REGION"){
                                cmdmode = "ERROR";
                                console.log('Erase unsecure region command not working - Unexpected Response');
                                makedisconnect('Erase unsecure region command not working - Unexpected Response '+value,true);
                            }else if(cmdmode == "ERASE_REGION"){
                                cmdmode = "ERROR";
                                console.log('Erase region command not working - Unexpected Response');
                                makedisconnect('Erase region command not working - Unexpected Response '+value,true);
                            }else if(cmdmode == "WRITE"){
                                cmdmode = "ERROR";
                                console.log('Write memory command not working - Unexpected Response');
                                makedisconnect('Write memory command not working - Unexpected Response '+value,true);
                            }else if(cmdmode == "PROGRAM_LINE"){
                                cmdmode = "ERROR";
                                console.log('Programming the tag not working - Unexpected Response');
                                makedisconnect('Programming the tag not working - Unexpected Response '+value,true);
                            }else if(cmdmode == "GET_PROPERTY"){
                                cmdmode = "DISCONNECT";
                                console.log("Disconnect");
                                DisConnect();
                            }else{
                                cmdmode = "DISCONNECT";
                                console.log('Unexpected Response : '+cmdmode);
                                makedisconnect('Unexpected Response : '+cmdmode+" - "+value,true);
                            }

                            return;
                        }
                        if(cmdmode.includes("PROGRAM_LINE")){
                            attemptLimit += 1;
                            if(attemptLimit > total_attempt){
                                var vs = "No Response - Program Line - "+progLinesCnt;
                                checkConnectionState()
                                .then((data)=>{
                                    var s = "Tag Connected But "+vs;
                                    makedisconnect(s,true);
                                })
                                .catch((err)=>{
                                    console.log(vs);
                                    makedisconnect("Continue Again",true);
                                });
                            }else{
                                var cl = progLines[progLinesCnt-1].toUpperCase().trim(); 
                                let e = "Retry Program Line - "+(progLinesCnt)+" : "+cl;
                                console.log(e);
                                utils.errormsg += "//"+utils.startdt+"^"+e+"^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                   
                                WriteBLE(cl)
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                            }
                            return;
                        }
                        switch (cmdmode) {
                            case "PING":
                                cmdmode = "ANOTHHER_PING";
                                console.log("Another Ping => 5AA6");                                
                                WriteBLE("5AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "ANOTHHER_PING":
                                cmdmode = "SPECIAL_PING";
                                console.log("Special Ping => 535AA6");                                
                                WriteBLE("535AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "SPECIAL_PING":
                                makedisconnect("No response for Special Ping-535AA6",true);
                                break;
                            case "SB10123456789ABCDEFK":
                                makedisconnect("No response for SB10123456789ABCDEFK",true);
                                break;
                            case "CHANGE_TO_BOOTLOADER_MODE":
                                attemptLimit += 1;
                                if(attemptLimit > total_attempt){
                                    makedisconnect("No Response - Change to Bootloader Mode",true);
                                    break;
                                }
                                console.log("Retry Change to Bootlooder Mode"); 
                                utils.errormsg += "//"+utils.startdt+"^Retry Change to Bootlooder Mode^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                                
                                WriteBLE("534231303132333435363738394142434445464B")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "ERASE_UNSECURE_REGION":
                                attemptLimit += 1;
                                if(attemptLimit > total_attempt){
                                    makedisconnect("No Response - Erase unsecure region",true);
                                    break;
                                }
                                console.log("Retry Erase unsecure region");  
                                utils.errormsg += "//"+utils.startdt+"^Retry Erase unsecure region^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                               
                                WriteBLE("5AA40400CF320D00CC00")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "PING_TO_CONFIRM_BOOTLOADER_MODE":
                                attemptLimit += 1;
                                if(attemptLimit > total_attempt){
                                    makedisconnect("No Response - Ping to confirm bootloader",true);
                                    break;
                                }
                                console.log("Retry Ping to confirm bootloader");  
                                utils.errormsg += "//"+utils.startdt+"^Retry Ping to confirm bootloader^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                               
                                WriteBLE("5AA6")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "ERASE_REGION":
                                attemptLimit += 1;
                                if(attemptLimit > total_attempt){
                                    makedisconnect("No Response - Erase region",true);
                                    break;
                                }
                                console.log("Retry Erase region");  
                                utils.errormsg += "//"+utils.startdt+"^Retry Erase region^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                              
                                WriteBLE("5AA40C00F724020000020000000000500000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "WRITE":
                                attemptLimit += 1;
                                if(attemptLimit > total_attempt){ 
                                    makedisconnect("No Response - Write",true);
                                    break;
                                }
                                console.log("Retry Write"); 
                                utils.errormsg += "//"+utils.startdt+"^Retry Write^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                        
                                WriteBLE("5AA40C001BBD0401000200000000043E0000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "RESET":
                                attemptLimit += 1;
                                if(attemptLimit > 3){                               
                                    makedisconnect("No Response for Reset",true);
                                    break;
                                }
                                console.log("Retry Reset - 5AA404006F460B000000 - "+attemptLimit);
                                utils.errormsg += "//"+utils.startdt+"^Retry Reset - 5AA404006F460B000000^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                     
                                WriteBLE("5AA404006F460B000000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "GET_PROPERTY":
                                attemptLimit += 1;
                                if(attemptLimit > 3){ 
                                    attemptLimit = 0;
                                    console.log("No response for Get Property"); 
                                    makedisconnect("No response for Get Property",true);
                                    break;
                                }
                                console.log("Retry Get Property - 5AA40C004B33070000020100000000000000");
                                utils.errormsg += "//"+utils.startdt+"^Retry Get Property - 5AA40C004B33070000020100000000000000^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();                      
                                WriteBLE("5AA40C004B33070000020100000000000000")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                            case "RETRY_CONNECTED":
                                attemptLimit += 1;
                                if(attemptLimit > 3){                                 
                                    makedisconnect("No Response for 5AA1 After Reconnect",true);
                                    break;
                                }
                                console.log("Retrying 5AA1 After Reconnect..");
                                utils.errormsg += "//"+utils.startdt+"^Retrying 5AA1 After Reconnect..^"+utils.getDateTime();
                                utils.startdt = utils.getDateTime();
                                WriteBLE("5AA1")
                                .then((data)=>{ run(); })
                                .catch((data)=>{ run(); });
                                break;
                        }

                    },1000);
                }
                es.onmessage = function(e) {
                    if (e.data == '') { console.log("Data Is Empty",e); return; }
                    is_have_response = true;
                    var JSONObj = JSON.parse(e.data);
                    var value = JSONObj.value.toUpperCase();
                    is_response = value;
                    console.log('response : '+value);
                    console.log("");
                }
                es.onerror = function(e) {
                    console.log('On Err in Upgrade :' + e.toString());
                    makedisconnect(e.toString(),true);
                }
                function checkConnectionState(){
                    return new Promise(function(resolve,reject){
                        axios.get("http://10.10.10.254/gap/nodes?connection_state=connected&mac="+utils.servermac,{})
                        .then((response)=>{
                            var nodes = response.data.nodes;
                            var bles = [];
                            for (let vv = 0; vv < nodes.length; vv++) {
                                const element = nodes[vv];
                                bles.push(element.id);                             
                            }
                            var isConnected = bles.includes(utils.serverble);                           
                            if (isConnected) {
                                resolve(true);
                            }else{
                                reject(false);
                            }
                        })
                        .catch((error)=>{
                            reject(false);
                        });
                    });
                }
                function WriteBLE(cmd_now,taketime = 0){
                    return new Promise((resolve,reject)=>{
                        is_have_response = false;
                        setTimeout(() => {
                            var wbleURL = 'http://10.10.10.254/gatt/nodes/'+utils.serverble+'/handle/17/value/' + cmd_now + '/?chip=1&mac=' + utils.servermac;
                            axios.get(wbleURL,{headers:{"Authorization":"Bearer "+utils.servertoken}})
                            .then((data)=>{resolve(data);})
                            .catch((data)=>{reject(data);})
                        }, taketime);
                    });
                }
                readProgram();
                cmdmode = "PING";
                console.log('Ping => 5AA6');
                WriteBLE("5AA6")
                .then((data)=>{ run(); })
                .catch((data)=>{ run(); });
            }catch(e){
                console.log("Error on upgrade function "+e);
                resolve([true,e.toString()]);
            }
        });
    }
}