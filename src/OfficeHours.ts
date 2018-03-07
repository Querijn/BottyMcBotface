import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

interface QuestionData {
    uuid: number;
    author: string;
    question: string;
}

export default class OfficeHours {
    private bot: Discord.Client;
    private questions: QuestionData[];
    private sharedSettings: SharedSettings;


    constructor(bot: Discord.Client, sharedSettings: SharedSettings, questionFile: string) {
        console.log("Requested OfficeHours extension..");
        this.bot = bot;

        this.questions = fileBackedObject(questionFile);
        console.log("Successfully question file.");


        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onCommand.bind(this));
    }

    onBot() {
        console.log("OfficeHours extension loaded.");
    }

    nextId() {
        return Math.max(...this.questions.map(x => x.uuid)) + 1;
    }


    onCommand(message: Discord.Message) {

        const authorId = message.author.id;
        const isAdmin = (message.member && findOne(message.member.roles, this.sharedSettings.officehours.allowedRoles));

        if (message.content.startsWith("!ask")) {

            const question = message.content.substr(message.content.indexOf(" ") + 1);
            const qData = {
                author: authorId,
                question: question,
                uuid: this.nextId()
            };

            this.questions.push(qData);

            message.reply(this.sharedSettings.officehours.addedMessage);
        }

        if (!isAdmin) {
            return;
        }

        if (message.content.startsWith("!question_list")) {

            for (const data of this.questions) {
                message.author.sendMessage(`${data.uuid}: <@${data.author}>: ${data.question}`)
            }
        }

        if (message.content.startsWith("!question_remove")) {
            const arr = message.content.split(" ");

            if (arr.length === 2) {
                const id = Number(message.content.split(" ")[1]);
                this.questions = this.questions.filter(q => q.uuid != id);
            }

            message.reply(this.sharedSettings.officehours.removedMessage);
        }

        if (message.content.startsWith("!open")) {
            message.delete();
            message.channel.sendMessage(this.sharedSettings.officehours.openMessage);

            for (const data of this.questions) {
                message.channel.sendMessage(`<@${data.author}>: ${data.question}`)
            }

            this.questions = [];
        }

        if (message.content.startsWith("!close")) {
            message.delete();
            message.channel.sendMessage(this.sharedSettings.officehours.closeMessage);
        }
    }
}


const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr2.some(x => arr1.has(x));
};