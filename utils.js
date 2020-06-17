const fs = require("fs");
module.exports = {
    URL:"http://qn.sx3hub.com:9980/SX3/api",
    upreqfolder:"./upgraderequest",
    upgfile:"./upgfiles",
    upgfilenamestart:"v",
    pendingfname:"pending",
    successfname:"success",
    failurefname:"failure",
    errorlog:"log",
    cgoodname:"collectiongood",
    upgradeingbles:{},
    JsonArray:[],
    offset:[],
    startdt:null,
    errormsg:"",
    hseg : "",
    currentrequest:null,
    tagversion:"",
    validPacket:[],
    isUpgrading:false,
    process:"",
    missingPktList:null,
    serverip:null,
    maxloglines:20,
    servermac:null,
    servertoken:null,
    serverble:null,
    serverfile:null,
    oldupdate:{ble:null,try:0},
    getUID : function(){
        let date = new Date();
        let y = date.getFullYear();
        let m = date.getMonth()+1;
        let d = date.getDate();
        let h = date.getHours();
        let min = date.getMinutes();
        let s = date.getSeconds();
        let ms = date.getMilliseconds();
        return y+""+m+""+d+""+h+""+min+""+s+""+ms;
    },
    getRequestCount : function(){
        try{
            var json =  fs.readFileSync(this.upreqfolder+"/"+this.pendingfname+".txt");
            json = JSON.parse(json);
            var length = Object.keys(json).length;
            return (5-length);
        }catch(e){
            console.log("ERR : Request Count - ",e);
            return 0;
        }
    },
    reverseStr(string){
        return string.split("").reverse().join("");
    },
    isMAC:function(macadd){
        var regex = /^([0-9A-F]{2}[:]){5}([0-9A-F]{2})$/;
        return regex.test(macadd);
    },
    createVersionfile:function(data,filename){
        fs.writeFile(this.upgfile+"/"+this.upgfilenamestart+filename+".txt",data, (err)=>{
            if(err){
                console.log("Error creating version file : ",err);
                return;
            }
        });
    },
    checkorcreateUpgfolder:function(){
        if (!fs.existsSync(this.upgfile)) {
            fs.mkdir(this.upgfile, { recursive: true }, (err) => {
                if (err) console.log("Error create directory : ",err);
            });
        }
    },
    isversionFileexist(version){
        var filename = this.upgfile+"/"+this.upgfilenamestart+version+".txt";
        return fs.existsSync(filename);
    },
    isfileExist:function(filename){
        if (!fs.existsSync(this.upreqfolder)) {
          fs.mkdir(this.upreqfolder, { recursive: true }, (err) => {
            if (err) console.log("Error create directory : ",err);
          });
          return false;
        }
        return fs.existsSync(this.upreqfolder+"/"+filename+".txt");
    },
    createfile:function(filename){
        fs.writeFile(this.upreqfolder+"/"+filename+".txt",'{}', (err)=>{
            if(err){
                console.log("Error create file ",filename," : ",err);
            }
        });
    },
    createfileLog:function(filename){
        fs.writeFile(this.upreqfolder+"/"+filename+".txt",'', (err)=>{
            if(err){
                console.log("Error create file ",filename," : ",err);
            }
        });
    },
    log:function(dat){
        // fs.appendFile(this.upreqfolder+"/"+this.errorlog+".txt","\n"+" - "+dat, function (err) {
        //     if(err){
        //         console.log("Error Write log file ",err);
        //     }
        // });
        var appu = this;
        fs.readFile(appu.upreqfolder+"/"+appu.errorlog+".txt", 'utf8', function(err, data){
            if (err){
                console.log("Error Write log file ",err);
                return;
            }
            data = dat+"\n"+data;
            var linesCount = data.split("\n").length;
            if(linesCount < appu.maxloglines){
                console.log("Write log");
                console.log(data);
                console.log("");
                fs.writeFile(appu.upreqfolder+"/"+appu.errorlog+".txt",data);
            }else{
                var data1 = data.split("\n");
                data1.splice(appu.maxloglines,linesCount);
                var string = data1.join("\n");
                console.log("Write log");
                console.log(string);
                console.log("");
                fs.writeFile(appu.upreqfolder+"/"+appu.errorlog+".txt",string);
            }
        });
    },
    getFileDataFullPath(path){
        try{
            return fs.readFileSync(path,"utf8");
        }catch(e){
            return null;
        }
    },
    getFiledata:function(filename){
        try{
            return fs.readFileSync(this.upreqfolder+"/"+filename+".txt");
        }catch(e){
            return null;
        }
    },
    writeFiledata:function(filename,data) {
        try {
            fs.writeFileSync(this.upreqfolder+"/"+filename+".txt", data);
            return true;
        } catch (error) {
            console.log("Write Data err : ",error);
            return false;
        }
    },
    writeSuccess:function(ble,d){
        return new Promise((resolve,reject)=>{
            var data = null;
            try{
                let fnme = this.upreqfolder+"/"+this.successfname+".txt";
                data = fs.readFileSync(fnme);
                var success_json = {};
                if(data!=null){
                    success_json = JSON.parse(data);
                }
                success_json[ble]=d;
                let fdata = JSON.stringify(success_json);
                fs.writeFile(fnme,fdata, function (err) {
                    if (err){
                        console.log(err);
                        resolve(false);
                    }
                    resolve(true);
                });   
            }catch(e){console.log(e);resolve(false);}
        })
    },
    writeFailure:function(ble,d){
        return new Promise((resolve,reject)=>{
            var data = null;
            try{
                let fnme = this.upreqfolder+"/"+this.failurefname+".txt";
                data = fs.readFileSync(fnme);
                var failure_json = {};
                if(data!=null){
                    failure_json = JSON.parse(data);
                }
                failure_json[ble]=d;
                let fdata = JSON.stringify(failure_json);
                fs.writeFile(fnme, fdata , function (err) {
                    if (err){
                        console.log(err);
                        resolve(false);
                    }
                    resolve(true);
                });   
            }catch(e){console.log(e);resolve(false);}
        })
    },
    removeItemsbyjson:function(source,destination){
        var keys = Object.keys(source);
        keys.forEach(elm => {
            delete destination[elm];
        });
        return destination;
    },
    replaceAbcdef:function(text){
        text = text.replace(/A/gi,":");text = text.replace(/B/gi,";");
        text = text.replace(/C/gi,"<");text = text.replace(/D/gi,"=");
        text = text.replace(/E/gi,">");text = text.replace(/F/gi,"?");
        return text
    },
    revertAbcdef:function(text){
        text = text.replace(/:/gi,"A");text = text.replace(/;/gi,"B");
        text = text.replace(/</gi,"C");text = text.replace(/=/gi,"D");
        text = text.replace(/>/gi,"E");text = text.replace(/\?/gi,"F");
        return text
    },
    decimalToHexString:function(number)
    {
        if (number < 0){ number = 0xFFFFFFFF + number + 1;}
        return number.toString(16).toUpperCase();
    },
   hexToDec:function(hex) {
        hex += "";var result = 0, digitValue;hex = hex.toLowerCase();
        for (var z = 0; z < hex.length; z++) {
            digitValue = '0123456789abcdefgh'.indexOf(hex[z]);result = result * 16 + digitValue;
        }
        return result;
    },
    HexaToDeciConv:function(str){
        var Deci = "";
        if(str!=""){ Deci = this.hexToDec(str.split("").reverse().join("")); }
        return Deci==""?0:Deci; 
    },
    crc16ChkSum:function(input){ 
        input = ""+this.revertAbcdef(input);
        input = input.includes("7A7A7A7A7A7A")?input.split("0D0A")[0]:input;
        var len = input.length,crc = input.substring(len-4,len),tempStr = "";     
        input = input.substring(0,len-4); 
        for (let a = 0; a <= input.length; a+=2) {
            var element = input.substring(a,a+2);
            if(element==""){ continue; }
            tempStr += ""+String.fromCharCode(this.hexToDec(""+element+""));        
        }
        var crc1 = this.crc16(tempStr),tempCrc = this.decimalToHexString(crc1),tempCrclen = 4-tempCrc.length,tempzero = "";
        for(var k=1;k<=tempCrclen;k++){ tempzero += "0"}
        tempCrc = tempzero+""+tempCrc;
        var res = tempCrc.substring(2,4)+""+tempCrc.substring(0,2);
        return res==crc?1:0;
    },
    crc16:function(s) {
        var crcTable = [0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5,
            0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
            0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210,
            0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
            0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c,
            0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
            0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b,
            0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
            0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6,
            0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
            0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5,
            0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
            0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969,
            0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
            0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc,
            0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
            0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03,
            0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
            0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6,
            0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
            0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a,
            0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
            0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1,
            0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
            0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c,
            0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
            0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb,
            0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
            0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447,
            0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
            0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2,
            0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
            0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9,
            0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
            0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c,
            0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
            0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0,
            0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
            0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07,
            0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
            0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba,
            0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
            0x2e93, 0x3eb2, 0x0ed1, 0x1ef0];
        var crc = 0xFFFF;var j;var isfaild = false;
        for (var a = 0; a < s.length; a++) {
            c = s.charCodeAt(a);
            if (c > 255) {isfaild = true; break;}
            j = (c ^ (crc >> 8)) & 0xFF;crc = crcTable[j] ^ (crc << 8);
        }
        if(isfaild){ return 0;}
        return ((crc ^ 0) & 0xFFFF);
    },
    HexaToDeciConvRT:function(str){
        var Deci = ""; if(str != ""){ Deci = this.hexToDec(str); }
        return Deci!=""?Deci:0;
    },
    GetVersionTag:function(HeaderInfo){
        var majorV = this.HexaToDeciConvRT(HeaderInfo.substring(40,42));
        var minorV = this.HexaToDeciConvRT(HeaderInfo.substring(42,44));
        var subminorV = this.HexaToDeciConvRT(HeaderInfo.substring(44,46));
        var res_majmin = String.fromCharCode(majorV)+"."+String.fromCharCode(minorV)+"."+String.fromCharCode(subminorV);
        return res_majmin;
    },
    CheckHeader:function(Header){
        var temp = this.revertAbcdef(Header),PacketDataConv = "",revarr = temp.match(/.{1,2}/g);
        for (let j = 0; j < revarr.length; j++) {
            const e = revarr[j];
            PacketDataConv +=  e.split("").reverse().join("");
        }
        return this.GetVersionTag(PacketDataConv);
    },
    ConvertToGs:function(Axis=""){
        if(Axis==0) {return 0;}
        var SampleByte=65535,SampleByte1=32767,ADRes=18.3e-6,QVoltage=600.0e-3,FullRange=1.2,CurSenseOut=1.33e-02;
        if(Axis>SampleByte1){
            Axis = QVoltage - ((SampleByte+1-Axis)*(ADRes));
        }else{
            Axis = QVoltage+(Axis*ADRes);
        }
        Axis = (Axis-(FullRange/2))/CurSenseOut;
        return Axis;
    
    },
    SingleDataArray:function(pdc,pktnum){
        let self = this;
        let DataInfo= self.revertAbcdef(pdc);
        let RepeatDataPartSep = DataInfo.substring(12,DataInfo.length);
        let RepeatDataPart = RepeatDataPartSep.substring(0,(RepeatDataPartSep.length - 4));
        let len = RepeatDataPart.length;
        let cnt = 0;
        let ret = 0;
        for(var c=1;c<=len;c=c+16){
            let RepeatData = ""
            RepeatData = RepeatDataPart.substring(c-1,c+15);
            let DataSampleNumber = self.HexaToDeciConv(RepeatData.substring(0,4))
            cnt++;
            let nu = pktnum-1*9-8+cnt-1;
            if(DataSampleNumber != nu){ ret = 1; break; }
            break;
        }
        return ret;
    },
    DataArray:function(pdc){
        let self = this;
        var DataInfo= self.revertAbcdef(pdc);
        var RepeatDataPartSep = DataInfo.substring(12,DataInfo.length);
        var RepeatDataPart = RepeatDataPartSep.substring(0,(RepeatDataPartSep.length - 4));
        var len = RepeatDataPart.length
        for(var c=1;c<=len;c=c+16){
            var RepeatData = ""
            RepeatData = RepeatDataPart.substring(c-1,c+15);
            var DataSampleNumber = self.HexaToDeciConv(RepeatData.substring(0,4));
            var DataXAxis = self.HexaToDeciConv(RepeatData.substring(4,8));
            var DataYAxis = self.HexaToDeciConv(RepeatData.substring(8,12));
            var DataZAxis = self.HexaToDeciConv(RepeatData.substring(12,16));
            DataXAxis = self.ConvertToGs(DataXAxis);
            DataYAxis = self.ConvertToGs(DataYAxis);
            DataZAxis = self.ConvertToGs(DataZAxis);
            var pv = {"data":DataXAxis.toFixed(5)+","+DataYAxis.toFixed(5)+","+DataZAxis.toFixed(5)};
            self.JsonArray.push(pv);
        }
        if(DataSampleNumber != self.JsonArray.length){
            return 1;
        }
        return 0;
    },
    validateDataCollection:function(datas){
        let self = this;
        return new Promise((resolve,reject)=>{
            try {
                function setJsonarray(count){ for(var b=1;b<=count;b++){ self.JsonArray.push(",,"); } }
                /** Code start's here */
                var json = datas;
                if(typeof datas != "object"){
                    json = JSON.parse(datas);
                }
                self.JsonArray = [];
                var file = "",Count = 1,PrePacket=1,HeaderSeg="",CorruptPacket=[],HeaderVers=0;
                for (let y = 0; y < json.length; y++) {
                    const element = json[y];
                    file += element.value;
                }
                file = file.replace(/53444E/gi, ",53444E");
                var file_arr = file.split(",");
                var HeaderSec = file_arr[0],HeaderData="";
                if(HeaderSec.includes("53484E")){
                    var txt_tmp = "53484E"+HeaderSec.split("53484E")[1];
                    HeaderData = self.replaceAbcdef(txt_tmp);
                }
                if(HeaderSec.includes("534841")){
                    var txt_tmp = "534841"+HeaderSec.split("534841")[1];
                    HeaderData = self.replaceAbcdef(txt_tmp);
                }
                var HeaderDataConv = "";
                HeaderSeg = HeaderData;
                var revarr = HeaderData.match(/.{1,2}/g);
                for (let x = 0; x < revarr.length; x++) {
                    const e = revarr[x];
                    HeaderDataConv +=  e.split("").reverse().join("");
                }
                HeaderSeg = HeaderDataConv;
                HeaderVers = self.CheckHeader(HeaderSeg);
                self.hseg = HeaderSeg;
                console.log("HeaderSeg : ",self.hseg);
                console.log(HeaderVers);
                console.log("Version : ",HeaderVers);
                for (var k = 1; k < file_arr.length; k++) {
                    var FileData = file_arr[k];
                    if(FileData==""){ break; }
                    var PacketData = self.replaceAbcdef(FileData);
                    var CrcPkt = PacketData;
                    var PacketDataConv = "";
                    var revarr = PacketData.match(/.{1,2}/g);
                    for (let q = 0; q < revarr.length; q++) {
                        const e = revarr[q];
                        PacketDataConv +=  e.split("").reverse().join("");
                    }
                    var temp = PacketDataConv.substring(6,10); 
                    temp = self.revertAbcdef(temp);
                    var Packet = self.HexaToDeciConv(temp);
                    if(HeaderVers.replace(/\./g,"") >= 318){
                        var validPkt = self.crc16ChkSum(CrcPkt);
                        if(!validPkt){
                            CorruptPacket.push(PrePacket+1);
                            var cnt = 9;
                            if(self.revertAbcdef(PacketDataConv).includes("7A7A7A7A7A7A")){
                                cnt = 3
                            }
                            setJsonarray(cnt);
                            PrePacket += 1;
                            continue;
                        }
                    }
                    if(PacketDataConv.substring(6,10).length != 4){
                        CorruptPacket.push(PrePacket+1);
                        setJsonarray(9);
                        PrePacket += 1;
                        continue;
                    }
                    if( self.revertAbcdef(PacketDataConv).length != 160 && (!self.revertAbcdef(PacketDataConv).includes("7A7A7A7A7A7A")) ){
                        CorruptPacket.push(PrePacket+1);
                        setJsonarray(9);
                        PrePacket += 1;
                        continue;
                    }
                    var Calc = Packet - PrePacket;
                    if(Calc!=1){
                        var CalLim = Calc - 1;
                        for(var j=1;j<=CalLim;j++){
                            CorruptPacket.push(PrePacket+j);
                            setJsonarray(9);
                        }
                    }
                    if(PrePacket >= Packet){ continue; }
                    PrePacket = Packet;
                    if(PacketDataConv.length == 160){
                        var temppkt = self.revertAbcdef(PacketDataConv);
                        if(temppkt.includes("7A7A7A7A7A7A")){
                            PacketDataConv = temppkt.split("D0A0")[0];
                        }
                        var ICorrPkt = self.DataArray(PacketDataConv);
                        if(ICorrPkt == 1 && (HeaderVers.replace(/\./g,"")>=316)){
                            CorruptPacket.push(Packet);
                        }
                        continue;
                    }
                    if(self.revertAbcdef(PacketDataConv).length!=160 && (self.revertAbcdef(PacketDataConv).includes("7A7A7A7A7A7A"))){
                        PacketDataConv = self.revertAbcdef(PacketDataConv).split("D0A0")[0];
                        var ICorrPkt = self.DataArray(PacketDataConv);
                        if(ICorrPkt==1 && (HeaderVers.replace(/\./g,"") >=316)){
                            CorruptPacket.push(Packet);
                        }
                        continue;
                    }
                }
                resolve({"version":HeaderVers,"validPacket":self.JsonArray,"corruptedPacket":CorruptPacket});
            } catch (error) {
                reject(error.toString());
            }
        });
    },
    offSetCompensation:function(){
        if(this.validPacket.length <= 0) { return; }
        let XCount=0,YCount=0,ZCount=0,Xoffset=0,Yoffset=0,Zoffset=0;
        for (let index = 0; index < this.validPacket.length; index++) {
            const ele = this.validPacket[index];
            let v = ele.data;
            let arr = v.split(",");
            if(arr.length < 3) { continue; }
            if(arr[0] != "" && (arr[0] != 0)){ XCount += parseFloat(arr[0]); }
            if(arr[1] != "" && (arr[1] != 0)){ YCount += parseFloat(arr[1]); }
            if(arr[2] != "" && (arr[2] != 0)){ ZCount += parseFloat(arr[2]); }
        }
        Xoffset = XCount/this.validPacket.length;
        Yoffset = YCount/this.validPacket.length;
        Zoffset = ZCount/this.validPacket.length;
        for (let i = 0; i < this.validPacket.length; i++) {
            const obj = this.validPacket[i];
            let v = obj.data;
            let arr = v.split(",");
            if(arr[0]!=""){
                this.validPacket[i] = {"data":(arr[0]-Xoffset).toFixed(5)+","+(arr[1]-Yoffset).toFixed(5)+","+(arr[2]-Zoffset).toFixed(5)};
            }
        }
    },
    tempvoltConv:function(headerSeg){
        try {
            console.log("Header Seg : ",headerSeg);
            headerSeg = this.revertAbcdef(headerSeg);
            let stemp = headerSeg.substring(30,32)+""+headerSeg.substring(28,30);
            let ctemp = headerSeg.substring(34,36)+""+headerSeg.substring(32,34);
            let bvolt = headerSeg.substring(38,40)+""+headerSeg.substring(36,38);
            console.log(stemp);
            console.log(ctemp);
            console.log(bvolt);
            let vbit = 0.00001831082627603570611;
            stemp = this.hexToDec(stemp)*vbit;
            ctemp = this.hexToDec(ctemp)*vbit;
            bvolt = this.hexToDec(bvolt)*vbit;
            let svoltDegC = 0.965;
            let smvDegC = 0.003;
            let cvoltDegC = 0.716;
            let cmvDegC = 0.00162;
            stemp = ((stemp-svoltDegC)/smvDegC)+25;
            ctemp = ((ctemp-cvoltDegC)/cmvDegC)+25;
            bvolt = bvolt*3;
           let tempvolt = ((stemp*1.8)+32).toFixed(2)+"||"+((ctemp*1.8)+32).toFixed(2)+"||"+bvolt.toFixed(2);
           return tempvolt;
        } catch (error) {
            console.log(error);
            return "0||0||0";
        }
    },
    getDateTime:function(){
        let datestring = "";
        let date = new Date();
        let year = date.getUTCFullYear();
        let month = date.getUTCMonth()+1;
        let day = date.getUTCDate();
        let hours = date.getUTCHours();
        let min = date.getUTCMinutes();
        let sec = date.getUTCSeconds();
        datestring = month+"-"+day+"-"+year+"^"+hours+":"+min+":"+sec;
        return datestring;
    },
    getTimeString:function(){
        let datestring = "";
        let date = new Date();
        let year = date.getUTCFullYear();
        let month = date.getUTCMonth()+1;
        let day = date.getUTCDate();
        let hours = date.getUTCHours();
        let min = date.getUTCMinutes();
        let sec = date.getUTCSeconds();
        datestring = year+"-"+month+"-"+day+"T"+hours+":"+min+":"+sec+"Z";
        return datestring;
    },
    collectionGood:function(){
        let self = this;
        return new Promise((resolve,reject)=>{
            try {
                let stemp = null,battery=null,mtemp=null;
                if(parseFloat(self.tagversion) > 2){
                    let va = self.tempvoltConv(self.hseg);
                    console.log(va);
                    let arv = va.split("||");
                    stemp = arv[1];
                    mtemp = arv[0];
                    battery = arv[2];
                }
                var obj = {
                    "GatewayMAC":self.servermac,
                    "id":self.currentrequest.id,
                    "RouteGuid":self.currentrequest.routeguid,
                    "SensorId":self.currentrequest.sensorid,
                    "SensorType":self.currentrequest.sensortype,
                    "SensorModel":self.currentrequest.sensormodel,
                    "SensorHardwareVersion":self.currentrequest.sensorhardwareversion,
                    "SensorFirmwareVersion":self.tagversion,
                    "SensorTemperature":stemp,
                    "SensorBatteryVoltage":battery,
                    "MeasurementDateTime":self.getTimeString(),
                    "MeasuredTemperature":mtemp,
                    "OpSpeed":null,
                    "SampleRate":self.currentrequest.samplerate,
                    "TotalLines":self.validPacket.length,
                    "BLEMac":self.serverble,
                    "CollectionNotes":"",
                    "Lines":self.validPacket,
                }
                let filename = self.currentrequest.id+".txt";
                fs.writeFile(this.cgoodname+"/"+filename,JSON.stringify(obj), (err)=>{
                    if(err){
                        console.log("Error creating Collection good file : "+filename,err);
                        self.log("Error creating Collection good file : "+filename+" "+err);
                        reject();
                    }else{
                        resolve();
                    }
                });
            } catch (error) {
                reject();
            }
        });
    }
}