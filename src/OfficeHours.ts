import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

interface QuestionData {
    uuid: string;
    author: string;
    question: string;
}

export default class OfficeHours {
    private bot: Discord.Client;
    private questions: QuestionData[];
    private adminRoles: string[];

    private openMessage: string;
    private closeMessage: string;
    private addedMessage: string;
    private removedMessage: string;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, questionFile: string) {
        console.log("Requested OfficeHours extension..");
        this.bot = bot;

        this.questions = fileBackedObject(questionFile);
        console.log("Successfully question file.");

        this.openMessage = sharedSettings.officehours.openMessage;
        this.closeMessage = sharedSettings.officehours.closeMessage;
        this.addedMessage = sharedSettings.officehours.addedMessage;
        this.removedMessage = sharedSettings.officehours.removedMessage;
        this.adminRoles = sharedSettings.officehours.allowedRoles;

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onCommand.bind(this));
    }

    onBot() {
        console.log("OfficeHours extension loaded.");
    }

    nextId() {
        return Math.max.apply(Math, this.questions.map(o => o.uuid)) + 1;
    }


    onCommand(message: Discord.Message) {

        const authorId = message.author.id;
        const isAdmin = (message.member && findOne(message.member.roles, this.adminRoles));

        if (message.content.startsWith("!ask")) {

            const question = message.content.substr(message.content.indexOf(" ") + 1);
            const qData = {
                author: authorId,
                question: question,
                uuid: this.nextId()
            };

            this.questions.push(qData);

            message.reply(this.addedMessage);
        }

        if (!isAdmin) {
            return;
        }

        if (message.content.startsWith("!question_list")) {

            for (var data of this.questions) {
                message.author.sendMessage(`${data.uuid}: <@${data.author}>: ${data.question}`)
            }
        }

        if (message.content.startsWith("!question_remove")) {
            const arr = message.content.split(" ");

            if (arr.length == 2) {
                const id = message.content.split(" ")[1];
                this.questions = this.questions.filter(q => q.uuid != id);
            }

            message.reply(this.removedMessage);
        }

        if (message.content.startsWith("!open")) {
            message.delete();
            message.channel.sendMessage(this.openMessage);

            for (var data of this.questions) {
                message.channel.sendMessage(`<@${data.author}>: ${data.question}`)
            }

            this.questions.splice(0, this.questions.length);
        }

        if (message.content.startsWith("!close")) {
            message.delete();
            message.channel.sendMessage(this.closeMessage);
        }
    }
}


const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr2.some(v => {
        return !!arr1.get(v);
    });
};