const glob = require("glob");
const fs = require("fs");
const ProgressBar = require('progress');

const classes = [];
const fields = [];
const methods = [];

const classRegex = /CLASS (.*\/)*(.+?) (.*\/)*(.*)/g; //check
const fieldRegex = /FIELD (.+?) (.+?) (.*)/g;
const methodRegex = /METHOD (.+?) (.+?) (.*)((\n	*ARG \d .*)*)/g; //dont need to worry about <init>
const argRegex = /(?<=ARG \d ).*/g;

const classFunc = (_, _2, obfName, _3, deobfName)=>{
	classes.push({
		obfName, deobfName
	});
};
const fieldFunc = (_, obfName, deobfName)=>{
	fields.push({
		obfName, deobfName
	});
};
const methodFunc = (_, obfName, deobfName, _2, args)=>{
	methods.push({
		obfName, deobfName,
		args: args?[...args.matchAll(argRegex)].map(arg=>arg[0]):[],
	});
};

const processFile = (file)=>{

};

const javaTemplate=[
	"package com.kyfexuwu.jsonblocks;\n\n"+

	"/* This file was automatically generated, please do\n"+
	" * not mess with it unless you know what you're doing\n"+
	" */\n\n"+

	"import java.util.HashMap;\n\n"+

	"public class Translations {\n"+
	"    public static HashMap<String, String> translations = new HashMap<>(){\n",

	"    };\n"+
	"}\n"
];

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

			counter++;
			bar.tick();
		}
	}).then(_=>{
		let toExport = javaTemplate[0];

		for(const clazz of classes)
			toExport+=`		{"${clazz.deobfName}", "${clazz.obfName}"},\n`;
		for(const method of methods)
			toExport+=`		{"${method.deobfName}", "${method.obfName}"},\n`;
		for(const field of fields)
			toExport+=`		{"${field.deobfName}", "${field.obfName}"},\n`;

		toExport+=javaTemplate[1];

		fs.writeFileSync("./Translations.java",toExport);
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
    	switch (input[1]){
    		case "class":
    			return classes.find(clazz=>
    				clazz.obfName==input[2] || clazz.deobfName==input[2]
    			);
    		case "field":
    			return fields.find(field=>
    				field.obfName==input[2] || field.deobfName==input[2]
    			);
    		case "method":
    			return methods.find(method=>
    				method.obfName==input[2] || method.deobfName==input[2]
    			);
    		default:
    			return "must be class, field, or method";
    	}
    default:
      return "not a command. type help to see all commands";
  }
  return "something happened. oof";
};