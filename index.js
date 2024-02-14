const glob = require("glob");
const fs = require("fs");
const ProgressBar = require('progress');

const classes = [];
const fields = [];
const methods = [];

const masterRegex = /(?:\n|^)(	*)(CLASS|FIELD|METHOD) (?:[^ \n]*\/)*([^ \n]+) (?:[^ \n]*\/)*([^ \n]+)(?: ([^\n]*))?(?:\n	*COMMENT.*)*((?:\n	*ARG \d [^ \n]+)*)?/g;
//1: tabs
//2: class/field/method
//3: obfuscated name
//4: deobfuscated name
//5: type (not for class)
//6: arguments (only for method)

const tokenMaker = (tokenRegex) => {
	switch(tokenRegex[2]){
		case "CLASS":
			return classFunc(...tokenRegex);
		case "FIELD":
			return fieldFunc(...tokenRegex);
		case "METHOD":
			return methodFunc(...tokenRegex);
	}
};

const classFriendlyRegex = /(?:.+\.)*(.*)(\[])*/g;
const typeToClass = (clazz, informal=false) => {
	if(clazz==undefined) return;

	let arrCount=0;
	while(clazz.startsWith("[")){
		arrCount++;
		clazz=clazz.substring(1);
	}

	let toReturn="";
	let isPrimitive=true;
	switch(clazz[0]){
		case "B":
			toReturn=informal?"byte":"Byte";
			break;
		case "C":
			toReturn=informal?"char":"Character";
			break;
		case "D":
			toReturn=informal?"double":"Double";
			break;
		case "F":
			toReturn=informal?"float":"Float";
			break;
		case "I":
			toReturn=informal?"int":"Integer";
			break;
		case "J":
			toReturn=informal?"long":"Long";
			break;
		case "S":
			toReturn=informal?"short":"Short";
			break;
		case "Z":
			toReturn=informal?"bool":"Boolean";
			break;
		case "V":
			toReturn=informal?"void":"Void";
			break;
		case "L":
			isPrimitive=false;
			toReturn=clazz.substring(1,clazz.length-1).replaceAll("/",".").replace("$",".");
			break;
	}

	return {
		obfuscated: toReturn+"[]".repeat(arrCount),
		get deobfuscated(){
			const components = ([...toReturn.matchAll(classFriendlyRegex)][0]||[]);
			return this.deobfuscated=isPrimitive ?
				toReturn : (classes.find(clazz=>clazz.obfName==components[1])||{deobfName:toReturn.split(".").pop()})
					.deobfName+"[]".repeat(arrCount);
		}
	};
};

const classRegex = /CLASS (.*?) (.*)/g;
const classFunc = (rawString, tabs, _2, obfName, deobfName) => {
	let longs = [...rawString.matchAll(classRegex)][0];
	return {
		tokenType: "CLASS",
		tabsCount: (tabs||"").length,
		obfName, deobfName,
		longObf: longs[1].replaceAll("/","."),
		longDeobf: longs[2].replaceAll("/","."),
		raw: rawString
	};
};
const fieldFunc = (_, tabs, _2, obfName, deobfName, type) => {
	return {
		tokenType: "FIELD",
		tabsCount: (tabs||"").length,
		obfName, deobfName, type: typeToClass(type)
	};
};
const methodFunc = (_, tabs, _2, obfName, deobfName, type, args) => {
	return {
		tokenType: "METHOD",
		tabsCount: (tabs||"").length,
		obfName, deobfName,
		type: type?typeToClass(type.slice(type.indexOf(")")+1)):undefined,
		args: argFunc(type, args),
	};
};

const paramRegex = /(B|C|D|F|I|J|S|Z|V|L[^ ]*?;)/g;
const argRegex = /	*ARG \d (.*)/g;
const argFunc = (type, args) => {
	if(type==undefined||args==undefined) return;

	let names=[...args.matchAll(argRegex)].map(arg=>arg[1]);
	let types=[...type.slice(1,type.indexOf(")")).matchAll(paramRegex)].map(type=>typeToClass(type[0],true));

	return names.map((name,index)=>{return {name,type:types[index]}});
};

const intRegex = /.*?_(.*)/g;
const intSuffix = (name) => {
	return parseInt([...name.matchAll(intRegex)][0][1])
};

const classStack={
	put: (scope, clazz) => {
		classStack._currClass=scope;
		classStack._stack[scope]=clazz;
	},
	get: (scope) => {
		return {
			deobfName: classStack._stack[scope-1].deobfName,
			obfName: classStack._stack[scope-1].obfName,
		};
	},
	has: (scope) => classStack._stack[scope-1]!=undefined,

	_currClass: -1,
	_stack: []
};
const processFile = (file)=>{
	let tokens=[...file.matchAll(masterRegex)]
		.map(token=>tokenMaker(token))
		.filter(token=>token.obfName!="<init>")
		.filter(token=>token.tokenType=="CLASS"||token.type!=undefined)

	for(const token of tokens){
		switch(token.tokenType){
			case "CLASS":
				classStack.put(token.tabsCount,token);
				classes.push({
					obfName: token.obfName,
					deobfName: token.deobfName,
					longObf: token.longObf,
					longDeobf: token.longDeobf,

					_token: token
				});
				break;
			case "FIELD":
				if(classStack.has(token.tabsCount))
					fields.push({
						obfName: token.obfName,
						deobfName: token.deobfName,
						class: classStack.get(token.tabsCount),
						type: token.type,

					_token: token
					});
				break;
			case "METHOD":
				if(classStack.has(token.tabsCount))
					methods.push({
						obfName: token.obfName,
						deobfName: token.deobfName,
						args: token.args,
						class: classStack.get(token.tabsCount),
						type: token.type,

					_token: token
					});
				break;
		}
	}
};

glob.glob('./mappings/**/*.mapping')
	.then(arr=>{
		let counter=0;
		let length=arr.length;
		const bar = new ProgressBar('[:bar] Loading...', {
			complete: '=',
		    incomplete: ' ',
		    width: 20,
		    total: length
		});

		for(const fileName of arr){
			const file = fs.readFileSync("./"+fileName).toString()

			processFile(file);
			classStack._stack=[];
			classStack._currClass=-1;

			counter++;
			bar.tick();
		}

		fs.rmSync("./out", { recursive: true, force: true });
		fs.mkdirSync("./out");
	}).then(_=>{
		let classesSorted=[];
		for(const clazz of classes){
			classesSorted[intSuffix(clazz.obfName)]=`${clazz.obfName} ${clazz.deobfName} ${clazz.longObf} ${clazz.longDeobf}`;
		}

		fs.writeFileSync("./out/classes.txt",classesSorted.join("\n")+"\n");

	}).then(_=>{
		let fieldsSorted=[];
		for(const field of fields.filter(field=>field.obfName.startsWith("field"))){
			fieldsSorted[intSuffix(field.obfName)]=`${field.obfName} ${field.deobfName} ${field.type.deobfuscated}`;
		}

		fs.writeFileSync("./out/fields.txt",fieldsSorted.join("\n")+"\n");

		let compFieldsSorted=[];
		for(const comp of fields.filter(field=>field.obfName.startsWith("comp"))){
			compFieldsSorted[intSuffix(comp.obfName)]=`${comp.obfName} ${comp.deobfName} ${comp.type.deobfuscated}`;
		}

		fs.writeFileSync("./out/compfields.txt",compFieldsSorted.join("\n")+"\n");
	}).then(_=>{
		let methodsSorted=[];
		for(const method of methods.filter(method=>method.obfName.startsWith("method"))){
			methodsSorted[intSuffix(method.obfName)]=`${method.obfName} ${method.deobfName} ${method.type.deobfuscated} ${
					(method.args||[]).map(arg=>arg.name+":"+arg.type.deobfuscated+" ").join("")
				}`;
		}

		fs.writeFileSync("./out/methods.txt",methodsSorted.join("\n")+"\n");
		
	}).then(_=>{
		commandLineHandler("help").then(msg=>console.log("mc-mapping-flattener\n"+msg));
	});

//--

const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on("line", async function(input) {
  console.log(await commandLineHandler(...input.split(" ")));
});

async function commandLineHandler(...input) {
  switch (input[0]) {
    case "help":
      return "" +
        "help: this command\n" +
        "lookup [class|field|method] (obfuscated name|deobfuscated name)"
        "";
    case "lookup":
    	let regex = new RegExp(input[2]);
    	switch (input[1]){
    		case "class":
    			return classes.filter(clazz=>
    				clazz.obfName.match(regex) || clazz.deobfName.match(regex)
    			);
    		case "field":
    			return fields.filter(field=>
    				field.obfName.match(regex) || field.deobfName.match(regex)
    			);
    		case "method":
    			return methods.filter(method=>
    				method.obfName.match(regex) || method.deobfName.match(regex)
    			);
    		default:
    			return "must be class, field, or method";
    	}
    default:
      return "not a command. type help to see all commands";
  }
  return "something happened. oof";
};