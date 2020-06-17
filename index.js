const axios = require("axios");
const FormData = require('form-data');
const utils = require("./utils");
const ble = require("./ble");
const fs = require('fs');
const checkRequest_time = 8000;
const dodownloadfile_time = 8000;
const run_time = 20000;
const dochecksuccfail_time = 8000;
const pendingfname = "pending";
const successfname = "success";
const failurefname = "failure";
const cgoodname = "collectiongood";
const errorlog = "log";
Array.prototype.removeVal = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};
String.prototype.getjson = function(string){
    try {
        return JSON.parse(string);
    } catch (error) {
        return {}
    }
}
utils.checkorcreateUpgfolder();
if(!utils.isfileExist(pendingfname)){
    utils.createfile(pendingfname);
}
if(!utils.isfileExist(successfname)){
    utils.createfile(successfname);
}
if(!utils.isfileExist(failurefname)){
    utils.createfile(failurefname);
}
if(!utils.isfileExist(errorlog)){
    utils.createfileLog(errorlog);
}
/**
 * Check Request
 * # sudo cc usbreset.c -o usbreset;
 * # sudo chmod +x usbreset;
 * # sudo apt-get install -y usbutils;
 * # nohup node index.js;
 */
function checkRequest(){
    try {
        var len = utils.getRequestCount();
        if(len == 0 || utils.isUpgrading){
            setTimeout((function() {checkRequest();}), checkRequest_time);
            return;
        }
        var config = {
            headers: { 'Content-Type': 'application/json'},
        };
        var data = {
            "mac" : utils.servermac,
            "length" : len
        }
        axios.post(utils.URL+'/gettagrequest',data,config)
        .then((response)=>{
            if(response.data.status != 1){
                console.log("Err: ",response.data.msg);
                utils.log("Err check status  0 : "+response.data.msg)
                setTimeout((function() {checkRequest();}), checkRequest_time);
                return;
            }
            console.log("");
            let pending_json = utils.getFiledata(pendingfname);
            pending_json = JSON.parse(pending_json);
            let dta = response.data.data;
            dta.forEach(elm => {
                let uid = utils.getUID();
                pending_json[uid]={"uid":uid,"id":elm.id,"ble":elm.ble,"version":elm.version,"process":elm.process.toLowerCase()
                                    ,"routeguid":elm.RouteGuid,"sensorid":elm.SensorId,"sensortype":elm.SensorType,
                                "sensormodel":elm.SensorModel,"sensorhardwareversion":elm.SensorHardwareVersion,
                               "samplerate":elm.sampleRate,"noofsamples":elm.noOfsamples};
            });
            console.log("Pending Data : ",JSON.stringify(pending_json));
            console.log();
            utils.writeFiledata(pendingfname,JSON.stringify(pending_json));
            setTimeout((function() {checkRequest();}), checkRequest_time);
        })
        .catch((err)=>{
            utils.log("Error (checkRequest)"+err.toString());
            setTimeout((function() {checkRequest();}), checkRequest_time);
        });
    } catch (error) {
        utils.log("Error (checkRequest_time):"+error);
        setTimeout((function() {checkRequest();}), checkRequest_time);
    }
}

/**
 * Download BLE Version File
 */
function dodownloadfile(){
    try{
        if(utils.isUpgrading){
            setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
            return;
        }
        var data = utils.getFiledata(pendingfname);
        var pending_json = {};
        var datatpe = typeof data;
        if(data!=null && (datatpe == "object")){
            pending_json = JSON.parse(data);
        }
        if(pending_json.length <= 0){
            setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
            return;
        }
        var mac = Object.keys(pending_json);
        var version = null;
        var len = mac.length;
        for(var idx=0;idx<len;idx++){
            let v = pending_json[mac[idx]];
            if(v.process != "firmwareupgrade"){ continue; }
            var isexist = utils.isversionFileexist(v.version);
            if(!isexist){
                version = v.version;
                break;
            }
        }
        if(version==null){
            setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
            return;
        }
        console.log("Down : ",version);
        axios.get(utils.URL+'/getfile?'+version)
        .then((response)=>{
            let data = response.data;
            if(typeof data == "string"){
                data = data.getjson(data);
            }
            if(!data.hasOwnProperty("version") || !data.hasOwnProperty("content") ){ console.log("Invalid JSON format. Key not found"); return;}

            if(data.version != version){
                console.log("Invalid Version File");
                setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
                return;
            }
            console.log("valid File");
            utils.createVersionfile(data.content,version);
            setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
        })
        .catch((response)=>{
            console.log("Version File Write err : ",response.response.status);
            utils.log("Version File Write err ");
            setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
        });
    }catch(e){
        utils.log("Error (dodownloadfile): ");
        setTimeout((function() {dodownloadfile();}), dodownloadfile_time);
    }
}
/**
 * Do Run  
 */
function run(){
    try{
        console.log("run Method");
        var result_json = utils.getFiledata(pendingfname);
        result_json = JSON.parse(result_json);
        var mac = Object.keys(result_json);
        if(mac.length<=0){
            utils.isUpgrading = false;
            setTimeout((function() {run();}), run_time);
            return; 
        }
        let self = this;
        var temp_mac = null;
        var temp_filename = null;
        var temp_id = null;
        var temp_process = null;
        utils.currentrequest = null;
        let processmethods = ["datacollection","firmwareupgrade"];
        for(var i=0;i<mac.length;i++){
            let uid = mac[i];
            utils.currentrequest = result_json[uid];
            temp_id = utils.currentrequest.id;
            temp_mac = utils.currentrequest.ble;
            temp_filename = utils.currentrequest.version;
            temp_process = utils.currentrequest.process;
            if(!processmethods.includes(temp_process)){
                console.log("Invalid Process Found ",temp_process);
                utils.log("Invalid Process Found ",temp_process);
                continue;
            }
            if(temp_process == "datacollection"){ break; }
            var isexist = utils.isversionFileexist(temp_filename);
            if(isexist){ break; }
            console.log("File not Found ",temp_filename);
            temp_mac = null;
            temp_filename = null;
            temp_id = null;
            utils.currentrequest = null;
        }
        if(!utils.isversionFileexist(temp_filename) && (temp_process == "firmwareupgrade")){
            utils.isUpgrading = false;
            setTimeout((function() {run();}), run_time);
            return;
        }
        utils.serverble = temp_mac;
        utils.process = temp_process;
        var filename = "";

        console.log("Process : ",temp_process);
        //Upgrade
        if(temp_process == "firmwareupgrade"){ 
            utils.isUpgrading = true;
            filename = temp_filename;
            utils.serverfile = utils.upgfile+"/"+utils.upgfilenamestart+filename+".txt";
            console.log("Update => ",utils.serverble, " - ", filename);
            utils.startdt = utils.startdt==null?utils.getDateTime():utils.startdt;
            getConnectBLE(utils)
            .then((data)=>{
                console.log("Starting Firmware Upgrade..");
                ble.upgradeBLE(utils)
                .then((data)=>{
                    console.log("Is Upgrade Faild : ",(data[0]?"YES":"NO"));
                    if(data[0]){
                        var reson = data[1].trim();
                        if(reson == "Continue Again"){
                            console.log("Tag Disconnected. Left to try again.");
                            utils.isUpgrading = false;                                
                            setTimeout((function() {run();}), run_time);
                            return;
                        }
                        reson = reson==""?"Failure in Process":reson;
                        utils.oldupdate={ble:null,try:0};
                        utils.errormsg += "//"+utils.startdt+"^"+reson+"^"+utils.getDateTime();
                        utils.startdt = utils.getDateTime();
                        utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":"upgrade"})
                        .then((data)=>{
                            let pd = utils.getFiledata(pendingfname);
                            pd = JSON.parse(pd);
                            delete pd[utils.currentrequest.uid];
                            utils.writeFiledata(pendingfname,JSON.stringify(pd));
                            console.log("Write File Status : ",data);
                            utils.errormsg = "";
                            utils.startdt = null;
                            utils.isUpgrading = false;
                            setTimeout((function() {run();}), run_time);
                        })
                        .catch((err)=>{
                            console.log(err);
                            setTimeout((function() {run();}), run_time);
                        });
                        return;
                    }
                    utils.oldupdate={ble:null,try:0};                   
                    utils.writeSuccess(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"reason":utils.errormsg,"version":filename,"process":"upgrade"})
                    .then((data)=>{
                        let pd = utils.getFiledata(pendingfname);
                        pd = JSON.parse(pd);
                        delete pd[utils.currentrequest.uid];
                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                        console.log("Write File Status : ",data);
                        utils.errormsg = "";
                        utils.startdt = null;
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                    })
                    .catch((err)=>{
                        console.log(err);
                        setTimeout((function() {run();}), run_time);
                    });
                })
                .catch((data)=>{
                    console.log("Error upgrade retry : ",data);
                    utils.log("Error upgrade retry");
                    if(utils.oldupdate.ble != utils.serverble){
                        utils.oldupdate.ble = utils.serverble;
                        utils.oldupdate.try = 1;
                        console.log("***Error upgrade Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                        return;
                    }
                    utils.oldupdate.try = utils.oldupdate.try+1;
                    if(utils.oldupdate.try<=3){
                        console.log("***Error upgrade Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);   
                        return;
                    }
                    utils.oldupdate={ble:null,try:0};
                    utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":utils.process})
                    .then((data)=>{
                        let pd = utils.getFiledata(pendingfname);
                        pd = JSON.parse(pd);
                        delete pd[utils.currentrequest.uid];
                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                        console.log("Write File Status : ",data);
                        utils.errormsg = "";
                        utils.startdt = null;
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                    })
                    .catch((err)=>{
                        console.log(err);
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                    });
                });
            })
            .catch((data)=>{
                utils.isUpgrading = false;
                if(data.retry){
                    utils.errormsg += "//"+utils.startdt+"^"+data.err+"^"+utils.getDateTime(); 
                    utils.isUpgrading = false;
                    setTimeout((function() {run();}), run_time);  
                    return;
                }
                utils.oldupdate={ble:null,try:0};
                utils.errormsg += "//"+utils.startdt+"^"+data.err+"^"+utils.getDateTime();
                utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":utils.process})
                .then((data)=>{
                    let pd = utils.getFiledata(pendingfname);
                    pd = JSON.parse(pd);
                    delete pd[utils.currentrequest.uid];
                    utils.writeFiledata(pendingfname,JSON.stringify(pd));
                    console.log("Write File Status : ",data);
                    utils.errormsg = "";
                    utils.startdt = null;
                    utils.isUpgrading = false;
                    setTimeout((function() {run();}), run_time);
                })
                .catch((err)=>{
                    console.log(err);
                    utils.isUpgrading = false;
                    setTimeout((function() {run();}), run_time);
                });
                return;
            })
            return;
        }
        //datacollect
        if(temp_process == "datacollection"){
            utils.isUpgrading = true;
            console.log("Datacollection =>",utils.serverble);
            utils.startdt = utils.startdt==null?utils.getDateTime():utils.startdt;
            getConnectBLE(utils)
            .then((data)=>{
                console.log("Starting DataCollection..");
                ble.datacollectBLE(utils)
                .then((data)=>{
                    console.log("Is DataCollection Faild : ",(data.status?"YES":"NO"));
                    if(data.status){
                        var reson = data.msg.trim();
                        utils.errormsg += "//"+utils.startdt+"^"+reson+"^"+utils.getDateTime();
                        utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":"datacollection"})
                        .then((data)=>{
                            let pd = utils.getFiledata(pendingfname);
                            pd = JSON.parse(pd);
                            delete pd[utils.currentrequest.uid];
                            utils.writeFiledata(pendingfname,JSON.stringify(pd));
                            console.log("Write File Status : ",data);
                            utils.errormsg = "";
                            utils.startdt = null;
                            utils.isUpgrading = false;
                            setTimeout((function() {run();}), run_time);
                        })
                        .catch((err)=>{
                            console.log(err);
                            utils.isUpgrading = false;
                            setTimeout((function() {run();}), run_time);
                        });
                        return;
                    }
                    if(data.data.length <= 0){
                        console.log("No data from DataCollection");
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                        return;
                    }
                    console.log();
                    console.log("Starts Validation, Total Packets : ",data.data.length);
                    utils.validateDataCollection(data.data)
                    .then((data)=>{
                        var v_Hversion = ""+data.version;
                        var v_pkt = data.validPacket;
                        utils.missingPktList = data.corruptedPacket;
                        utils.validPacket = data.validPacket;
                        utils.JsonArray = [];
                        console.log(" Validation Finished..... ");
                        console.log("Corrupted Packet : ");
                        console.log(utils.missingPktList);
                        console.log("Corrupted Packet Length : ",utils.missingPktList.length);
                        console.log("valid Packet Length : ",utils.validPacket.length);
                        console.log("Version : ",v_Hversion);   
                        utils.tagversion = v_Hversion;                             
                        console.log("");
                        if(parseFloat(v_Hversion) > 3 && (utils.missingPktList.length <= 1000) && (utils.missingPktList.length > 0)){
                            console.log("Missing Packets...");
                            getMissingPkt(utils,ble,v_Hversion)
                            .then((data)=>{
                                console.log("result - Missing packets ");
                                console.log("Corrupted Packet : ");
                                console.log(utils.missingPktList);
                                console.log("Corrupted Packet Length : ",utils.missingPktList.length);
                                console.log("valid Packet Length : ",utils.validPacket.length);
                                console.log("offSetCompensation..");
                                utils.offSetCompensation();
                                if(utils.validPacket.length != utils.currentrequest.noofsamples){
                                    console.log("Not match with No of Samples - ",utils.validPacket.length);
                                    utils.errormsg += "//"+utils.startdt+"^Not match with No of Samples - "+utils.validPacket.length+"^"+utils.getDateTime();
                                    utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":'',"reason":utils.errormsg,"process":"datacollection"})
                                    .then((data)=>{
                                        let pd = utils.getFiledata(pendingfname);
                                        pd = JSON.parse(pd);
                                        delete pd[utils.currentrequest.uid];
                                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                        console.log("Write File Status : ",data);
                                        utils.errormsg = "";
                                        utils.startdt = null;
                                        utils.isUpgrading = false;
                                        setTimeout((function() {run();}), run_time);
                                    })
                                    .catch((err)=>{
                                        console.log(err);
                                        utils.isUpgrading = false;
                                        setTimeout((function() {run();}), run_time);
                                    });
                                    return;
                                }
                                console.log("Collection Good...");
                                utils.collectionGood(temp_id)
                                .then((data)=>{
                                    utils.writeSuccess(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"reason":utils.errormsg,"process":"datacollection"})
                                    .then((data)=>{
                                        let pd = utils.getFiledata(pendingfname);
                                        pd = JSON.parse(pd);
                                        delete pd[utils.currentrequest.uid];
                                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                        console.log("Write File Status : ",data);
                                        utils.errormsg = "";
                                        utils.startdt = null;
                                        utils.isUpgrading = false;
                                        console.log("Datacollection Finished - File Created");
                                        setTimeout((function() {run();}), run_time);
                                    })
                                    .catch((err)=>{
                                        console.log(err);
                                        utils.isUpgrading = false;
                                        setTimeout((function() {run();}), run_time);
                                    });
                                })
                                .catch((err)=>{
                                    console.log(err);
                                    utils.errormsg += "//"+utils.startdt+"^"+err.toString()+"^"+utils.getDateTime();
                                    utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":'',"reason":utils.errormsg,"process":"datacollection"})
                                    .then((data)=>{
                                        let pd = utils.getFiledata(pendingfname);
                                        pd = JSON.parse(pd);
                                        delete pd[utils.currentrequest.uid];
                                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                        console.log("Write File Status : ",data);
                                        utils.errormsg = "";
                                        utils.startdt = null;
                                        utils.isUpgrading = false;
                                        setTimeout((function() {run();}), run_time);
                                    })
                                    .catch((err)=>{
                                        console.log(err);
                                        utils.isUpgrading = false;
                                        setTimeout((function() {run();}), run_time);
                                    });
                                });
                            })
                            .catch((err)=>{
                                console.log(err);
                                utils.errormsg += "//"+utils.startdt+"^"+err.toString()+"^"+utils.getDateTime();
                                utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":'',"reason":utils.errormsg,"process":"datacollection"})
                                .then((data)=>{
                                    let pd = utils.getFiledata(pendingfname);
                                    pd = JSON.parse(pd);
                                    delete pd[utils.currentrequest.uid];
                                    utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                    console.log("Write File Status : ",data);
                                    utils.errormsg = "";
                                    utils.startdt = null;
                                    utils.isUpgrading = false;
                                    setTimeout((function() {run();}), run_time);
                                })
                                .catch((err)=>{
                                    console.log(err);
                                    utils.isUpgrading = false;
                                    setTimeout((function() {run();}), run_time);
                                });
                            });
                            return;
                        }
                        console.log("offSetCompensation..");
                        utils.offSetCompensation();
                        if(utils.validPacket.length != utils.currentrequest.noofsamples){
                            console.log("Not match with No of Samples - ",utils.validPacket.length);
                            utils.errormsg += "//"+utils.startdt+"^Not match with No of Samples - "+utils.validPacket.length+"^"+utils.getDateTime();
                            utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":'',"reason":utils.errormsg,"process":"datacollection"})
                            .then((data)=>{
                                let pd = utils.getFiledata(pendingfname);
                                pd = JSON.parse(pd);
                                delete pd[utils.currentrequest.uid];
                                utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                console.log("Write File Status : ",data);
                                utils.errormsg = "";
                                utils.startdt = null;
                                utils.isUpgrading = false;
                                setTimeout((function() {run();}), run_time);
                            })
                            .catch((err)=>{
                                console.log(err);
                                utils.isUpgrading = false;
                                setTimeout((function() {run();}), run_time);
                            });
                            return;
                        }
                        console.log("Collection Good...");
                        utils.collectionGood(temp_id)
                        .then((data)=>{
                            utils.writeSuccess(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"reason":utils.errormsg,"version":"","process":"datacollection"})
                            .then((data)=>{
                                let pd = utils.getFiledata(pendingfname);
                                pd = JSON.parse(pd);
                                delete pd[utils.currentrequest.uid];
                                utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                console.log("Write File Status : ",data);
                                utils.errormsg = "";
                                utils.startdt = null;
                                utils.isUpgrading = false;
                                console.log("Datacollection Finished - File Created");
                                setTimeout((function() {run();}), run_time);
                            })
                            .catch((err)=>{
                                console.log(err);
                                utils.isUpgrading = false;
                                setTimeout((function() {run();}), run_time);
                            });
                        })
                        .catch((err)=>{
                            utils.collectionGood()
                            .then((data)=>{
                                utils.writeSuccess(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"reason":utils.errormsg,"version":"","process":"datacollection"})
                                .then((data)=>{
                                    let pd = utils.getFiledata(pendingfname);
                                    pd = JSON.parse(pd);
                                    delete pd[utils.currentrequest.uid];
                                    utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                    console.log("Write File Status : ",data);
                                    utils.errormsg = "";
                                    utils.startdt = null;
                                    utils.isUpgrading = false;
                                    console.log("Datacollection Finished - File Created");
                                    setTimeout((function() {run();}), run_time);
                                })
                                .catch((err)=>{
                                    console.log(err);
                                    utils.isUpgrading = false;
                                    setTimeout((function() {run();}), run_time);
                                });
                            })
                            .catch((err)=>{
                                let e = "Collection Good : "+err.toString().replace(/\n/g,"").trim();
                                console.log(e);
                                utils.errormsg += "//"+utils.startdt+"^"+e+"^"+utils.getDateTime();
                                utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":"","reason":utils.errormsg,"process":"datacollection"})
                                .then((data)=>{
                                    let pd = utils.getFiledata(pendingfname);
                                    pd = JSON.parse(pd);
                                    delete pd[utils.currentrequest.uid];
                                    utils.writeFiledata(pendingfname,JSON.stringify(pd));
                                    console.log("Write File Status : ",data);
                                    utils.errormsg = "";
                                    utils.startdt = null;
                                    utils.isUpgrading = false;
                                    setTimeout((function() {run();}), run_time);
                                })
                                .catch((err)=>{
                                    console.log(err);
                                    utils.isUpgrading = false;
                                    setTimeout((function() {run();}), run_time);
                                });
                            })
                        })            
                    })
                    .catch((err)=>{
                        let e = "Validation packet : "+err.toString().replace(/\n/g,"").trim();
                        console.log(e);
                        utils.errormsg += "//"+utils.startdt+"^"+e+"^"+utils.getDateTime();
                        utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":"datacollection"})
                        .then((data)=>{
                            let pd = utils.getFiledata(pendingfname);
                            pd = JSON.parse(pd);
                            delete pd[utils.currentrequest.uid];
                            utils.writeFiledata(pendingfname,JSON.stringify(pd));
                            console.log("Write File Status : ",data);
                            utils.errormsg = "";
                            utils.startdt = null;
                            utils.isUpgrading = false;
                            setTimeout((function() {run();}), run_time);
                        })
                        .catch((err)=>{
                            console.log(err);
                            utils.isUpgrading = false;
                            setTimeout((function() {run();}), run_time);
                        });
                    });
                })
                .catch((err)=>{
                    let e = "Error in DataCollection : "+err.toString().replace(/\n/g,"").trim();
                    console.log(e);
                    utils.errormsg += "//"+utils.startdt+"^"+e+"^"+utils.getDateTime();
                    utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":utils.process})
                    .then((data)=>{
                        let pd = utils.getFiledata(pendingfname);
                        pd = JSON.parse(pd);
                        delete pd[utils.currentrequest.uid];
                        utils.writeFiledata(pendingfname,JSON.stringify(pd));
                        console.log("Write File Status : ",data);
                        utils.errormsg = "";
                        utils.startdt = null;
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                    })
                    .catch((err)=>{
                        console.log(err);
                        utils.isUpgrading = false;
                        setTimeout((function() {run();}), run_time);
                    });
                });
            })
            .catch((data)=>{
                utils.isUpgrading = false;
                utils.oldupdate={ble:null,try:0};
                utils.errormsg += "//"+utils.startdt+"^"+data.err+"^"+utils.getDateTime();
                utils.writeFailure(utils.currentrequest.uid,{"id":utils.currentrequest.id,"ble":utils.serverble,"version":filename,"reason":utils.errormsg,"process":utils.process})
                .then((data)=>{
                    let pd = utils.getFiledata(pendingfname);
                    pd = JSON.parse(pd);
                    delete pd[utils.currentrequest.uid];
                    utils.writeFiledata(pendingfname,JSON.stringify(pd));
                    console.log("Write File Status : ",data);
                    utils.errormsg = "";
                    utils.startdt = null;
                    utils.isUpgrading = false;
                    setTimeout((function() {run();}), run_time);
                })
                .catch((err)=>{
                    console.log(err);
                    utils.isUpgrading = false;
                    setTimeout((function() {run();}), run_time);
                });
                return;
            })
            return;
        }
        console.log("Invalid Operation in the RUN method : ",temp_process);
        utils.isUpgrading = false;
        setTimeout((function() {run();}), run_time);
    }catch(err){
        console.log("run method error : ",err)
        utils.log("Error (run)",err);
        utils.isUpgrading = false;
        setTimeout((function() {run();}), run_time);
    }
}

function getMissingPkt(utils,ble,version){
    return new Promise((resolve,reject)=>{
        try {
            function PacketValidate(PacketData,PacketDataConv,PacketNum){
                if(version.replace(/\./g,"") >= 318){
                    let validPkt = utils.crc16ChkSum(PacketData);
                    if(!validPkt){ return 0; }
                }
                if(PacketDataConv.substr(6,10).length != 4){ return 0; }
                let PacketDataConvtr = utils.revertAbcdef(PacketDataConv);
                if( PacketDataConvtr.length != 160 &&
                    (PacketDataConvtr.length != 99) &&
                    (PacketDataConvtr.length != 64)){
                    return 0;
                }
                let crpPkt = utils.SingleDataArray(PacketDataConv,PacketNum);
                if(crpPkt){return 0}
                return 1;
            }
            getConnectBLE(utils)
            .then((data)=>{
                ble.datacollectGetMissingPkt(utils)
                .then((data)=>{
                    console.log("Is get Missing Packets Faild :",data.status);
                    if(data.status){ reject(data.msg); return; }
                    let failFlag = 0;
                    if(data.datas.length<=0){ reject("No Missing Packets received");return; }
                    for (let index = 0; index < data.datas.length; index++) {
                        const obj = data.datas[index];
                        let PacketData = ""+obj.value;
                        PacketData = PacketData.toUpperCase();
                        if(PacketData.substr(0,6) != "53444E"){ failFlag = 1; continue; }
                        let PktNum = PacketData.substr(6,10);
                        let PktNumRe = utils.reverseStr(PktNum.substr(0,2))+""+utils.reverseStr(PktNum.substr(2,4));
                        let PacketNum = utils.HexaToDeciConv(PktNumRe);
                        let PacketDataConv = "";
                        let revarr = PacketData.match(/.{1,2}/g);
                        for (let x = 0; x < revarr.length; x++) {
                            const e = revarr[x];
                            PacketDataConv +=  ""+e.split("").reverse().join("");
                        }
                        PacketDataConv = utils.replaceAbcdef(PacketDataConv);
                        let vPkt = PacketValidate(PacketData,PacketDataConv,PacketNum);
                        if(!vPkt){ failFlag = 1; continue; }
                        utils.missingPktList.removeVal(PacketNum);
                        utils.JsonArray = [];
                        utils.DataArray(PacketDataConv);
                        for (let index = 0; index < utils.JsonArray.length; index++) {
                            const element = utils.JsonArray[index+1];
                            let ar = element.split(",");
                            utils.validPacket[(((PacketNum-1)*9)-8)+index] = {"data":ar[0].toFixed(5)+","+ar[1].toFixed(5)+","+ar[2].toFixed(5)};
                        }
                    }
                    resolve();
                })
                .catch((err)=>{
                    console.log("Error on Get Missing Packet ",err);
                    reject("Error on Get Missing Packet "+err.toString());
                })
            })
            .catch((err)=>{
                console.log("Error (getConnectBLE): ",err);
                reject(err.toString());
            })
        } catch (error) {
            utils.log("Error (getMissingPkt)"+error.toString());
            reject(error.toString());
        }
    });
}
function getConnectBLE(utils){
    return new Promise((resolve,reject)=>{
        try {
            ble.getToken(utils)
            .then(function(data){
                utils.servertoken = data.access_token;
                // Connect BLE
                ble.connectBLE(utils)
                .then((data)=>{
                    // Set Notify
                    ble.setNotify(utils)
                    .then((data)=>{
                        resolve()
                    })
                    .catch((data)=>{
                        console.log("Handle 14 Notify Err retry");
                        let e ="Sensor offline or not responding - Handle14 error^"+utils.getDateTime();
                        if(utils.oldupdate.ble != utils.serverble){
                            utils.oldupdate.ble = utils.serverble;
                            utils.oldupdate.try = 1;
                            console.log("***Handle 14 Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                            reject({retry:true,err:e});
                            return;
                        }
                        utils.oldupdate.try = utils.oldupdate.try+1;
                        if(utils.oldupdate.try<=3){
                            console.log("***Handle 14 Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                            reject({retry:true,err:e});
                            return;
                        }
                        reject({retry:false,err:e});
                    });
                })
                .catch((data)=>{
                    let e ="Sensor offline or not responding - Connect error^"+utils.getDateTime();
                    console.log("Connected Err retry");
                    if(utils.oldupdate.ble != utils.serverble){
                        utils.oldupdate.ble = utils.serverble;
                        utils.oldupdate.try = 1;
                        console.log("***BLE Connection Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                        reject({retry:true,err:e});
                        return;
                    }
                    utils.oldupdate.try = utils.oldupdate.try+1;
                    if(utils.oldupdate.try<=3){
                        console.log("***BLE Connection Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                        reject({retry:true,err:e});   
                        return;
                    }
                    reject({retry:false,err:e});
                });
            })
            .catch(function(error){
                let e ="Sensor offline or not responding - Token error^"+utils.getDateTime();
                console.log("Token Err retry : ",error)
                utils.log("Token Err retry");
                if(utils.oldupdate.ble != utils.serverble){
                    utils.oldupdate.ble = utils.serverble;
                    utils.oldupdate.try = 1;
                    console.log("***Token Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                    reject({retry:true,err:e});
                    return
                }
                utils.oldupdate.try = utils.oldupdate.try+1;
                if(utils.oldupdate.try<=3){
                    console.log("***Token Err Try "+utils.oldupdate.try+ " for BLE "+utils.oldupdate.ble);
                    reject({retry:true,err:e});  
                    return;
                }
                reject({retry:false,err:e});
            });
        } catch (error) {
            reject({retry:false,err:error.toString()});
        }
    });
}

function docheckDCfile(){
    try{
        if(utils.isUpgrading){
            setTimeout((function() {docheckDCfile();}), dochecksuccfail_time);
            return;
        }
        let fileNames = fs.readdirSync("collectiongood");
        if(fileNames.length<=0){
            setTimeout((function() {docheckDCfile();}), dochecksuccfail_time);
            return;
        }
        let fname = fileNames[0];
        console.log("Sending File : "+fname);
        let data = utils.getFileDataFullPath("collectiongood/"+fname);
        data = data.replace(/\n/g,"");
        data = data.replace(/ /g,"");
        const headers = {
            'Content-Type': 'application/json',
          }
        axios.post(utils.URL+"/result", data,{
            headers: headers
        })
        .then(response => {
            console.log("File sent response : ",response.data);
            fs.unlinkSync("collectiongood/"+fname);
            setTimeout((function() {docheckDCfile();}), dochecksuccfail_time);
        }).catch(error => {
            console.log("DCollection File send Failed",error.response.status," - ",error.response.statusText);
            utils.log("DCollection File send Failed");
            setTimeout((function() {docheckDCfile();}), dochecksuccfail_time);
        });
    }catch(e){
        console.log(">>"+e);
        utils.log("Error (docheckDCfile)");
        setTimeout((function() {docheckDCfile();}), dochecksuccfail_time);
    }
}

function dochecksuccess(){
    try{
        if(utils.isUpgrading){
            setTimeout((function() {dochecksuccess();}), dochecksuccfail_time);
            return;
        }
        var success_json = utils.getFiledata(successfname);
        success_json = JSON.parse(success_json);
        var mac = Object.keys(success_json);
        if(mac.length<=0){
            setTimeout((function() {dochecksuccess();}), dochecksuccfail_time);
            return; 
        }
        var id = mac[0];
        var d = success_json[id];
        console.log("start set success..");
        axios.post(utils.URL+"/setsuccess",{
            "id":d["id"],
            "error":"success "+d["reason"].trim(),
            "mac" : utils.servermac
        })
        .then((response)=>{
            delete success_json[id];
            console.log("Updated server");
            utils.writeFiledata(successfname,JSON.stringify(success_json));
            setTimeout((function() {dochecksuccess();}), dochecksuccfail_time);
        })
        .catch((error)=>{
            utils.log("Set Success Failed");
            setTimeout((function() {dochecksuccess();}), dochecksuccfail_time);
        });
    }catch(e){
        console.log(e);
        utils.log("Error (dochecksuccess)");
        setTimeout((function() {dochecksuccess();}), dochecksuccfail_time);
    }
}

function docheckfailure(){
    try{
        if(utils.isUpgrading){
            setTimeout((function() {docheckfailure();}), dochecksuccfail_time);
            return;
        }
        var failure_json = utils.getFiledata(failurefname);
        failure_json = JSON.parse(failure_json);
        var mac = Object.keys(failure_json);
        if(mac.length<=0){
            setTimeout((function() {docheckfailure();}), dochecksuccfail_time);
            return;
        }
        var id = mac[0];
        var d = failure_json[id];
        var reson = d["reason"].trim();
        reson = reson==""?"Failure in Process":reson;
        console.log("start set failure..");
        axios.post(utils.URL+"/setfailure",{
            "id":d["id"],
            "error":d["reason"], 
            "mac" : utils.servermac
        })
        .then((response)=>{
            delete failure_json[id];
            console.log("Updated server");
            utils.writeFiledata(failurefname,JSON.stringify(failure_json));
            setTimeout((function() {docheckfailure();}), dochecksuccfail_time);
        })
        .catch((error)=>{
            utils.log("Set Failure error");
            setTimeout((function() {docheckfailure();}), dochecksuccfail_time);
        });
    }catch(e){
        console.log(e);
        utils.log("Error (docheckfailure) ");
        setTimeout((function() {docheckfailure();}), dochecksuccfail_time);
    }
}
function getInfo(){
    try{
        axios.get("http://10.10.10.254/cassia/info")
        .then((response)=>{
            var camac = response.data.mac;
            var servip = response.data["capwap-ip"].replace(/\n/g, '');
            servip = servip.trim();
            console.log("Server Mac : ",camac," Server IP :  ",servip);
            console.log();
            utils.serverip = servip;
            utils.servermac = camac;
            checkRequest();
            dodownloadfile();
            run();
            dochecksuccess();
            docheckfailure();
            docheckDCfile();
        })
        .catch((error)=>{
            console.log("Error get Server Info : ",error);
            setTimeout(() => {
                getInfo();
            }, 2000);
        });
    }catch(e){
        utils.log("Error (getInfo): ");
        setTimeout(() => {
            getInfo();
        }, 2000);
    }
}
getInfo();