import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";
import fetch from "node-fetch";

import Discord = require("discord.js");

interface QuestionData {
    uuid: number;
    requester: string | null,
    authorId: string;
    authorName: string,
    question: string;
}

interface OfficeHoursData {
    questions: QuestionData[];
    isOpen: boolean;
    lastCloseMessage: string
}

export default class OfficeHours {
    private bot: Discord.Client;
    private data: OfficeHoursData;
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, officeHoursData: string) {
        console.log("Requested OfficeHours extension..");
        this.bot = bot;

        this.data = fileBackedObject(officeHoursData);
        console.log("Successfully question file.");

        this.sharedSettings = sharedSettings;

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onCommand.bind(this));
		this.bot.on("channelUpdate", this.onChannelUpdate.bind(this));
    }

    onBot() {
        console.log("OfficeHours extension loaded.");
    }

    nextId() {
        return Math.max(...this.data.questions.map(x => x.uuid)) + 1;
    }


    onCommand(message: Discord.Message) {

        const isAskFor = message.content.startsWith("!ask_for");
        if (message.content.startsWith("!ask") && !isAskFor) {

            const question = message.content.substr(message.content.indexOf(" ") + 1);
            const questionData = {
                requester: null,
                authorId: message.author.id,
                authorName: message.author.username,
                question: question,
                uuid: this.nextId()
            };

            this.data.questions.push(questionData);

            message.reply(this.sharedSettings.officehours.addedMessage);
        }


        const isAdmin = (message.member && findOne(message.member.roles, this.sharedSettings.officehours.allowedRoles));
        if (!isAdmin) {
            return;
        }

        if (isAskFor) {

            const content = message.content.split(" ");
            const asker = message.mentions.members.first();

            if (asker) {
                const question = content.slice(2).join(" ");

                const questionData = {
                    requester: message.author.username,
                    authorId: asker.id,
                    authorName: asker.toString(),
                    question: question,
                    uuid: this.nextId()
                };

                this.data.questions.push(questionData);

                message.reply(this.sharedSettings.officehours.addedMessage);
            }
            return;
        }


        if (message.content.startsWith("!question_list")) {

            for (const data of this.data.questions) {
                message.author.send(`${data.uuid}: ${data.authorName}: ${data.question}`);
            }
            return;
        }


        if (message.content.startsWith("!question_remove")) {
            const arr = message.content.split(" ");

            if (arr.length === 2) {
                const id = +arr[1];
                this.data.questions = this.data.questions.filter(q => q.uuid != id);
            }

            message.reply(this.sharedSettings.officehours.removedMessage);
            return;
        }

        if (!(message.channel instanceof Discord.TextChannel) || message.channel.name !== "office-hours")
            return;

        if (message.content.startsWith("!open")) {
            message.delete();
            this.open(message.channel);
        }


        if (message.content.startsWith("!close")) {
            message.delete();
            this.close(message.channel);
        }
    }

    onChannelUpdate(oldChannel: Discord.TextChannel, newChannel: Discord.TextChannel) {

        if (newChannel.name !== "office-hours")
            return;

        let everyone = newChannel.guild.roles.find("name", "@everyone");
        let randomUser = newChannel.guild.members.find(x => x.roles.has(everyone.id));

        let canSendMessages = newChannel.permissionsFor(randomUser).has("SEND_MESSAGES");
        if (canSendMessages && !this.data.isOpen)
            this.open(newChannel);
        else if (canSendMessages && this.data.isOpen) 
            this.close(newChannel);
    }

    async open(channel: Discord.TextChannel) {
        if (this.data.isOpen) return;
        this.data.isOpen = true;

        // Start with open message
        channel.send(this.sharedSettings.officehours.openMessage);

        // Add all questions with mention
        for (const data of this.data.questions) {
            const member = channel.guild.members.get(data.authorId);
            const mention = member ? member : data.authorName;

            channel.send(`${mention} asked ${data.requester ? `(via ${data.requester})` : ""}: \`\`\`${data.question}\`\`\``);
        }

        if (!this.data.lastCloseMessage) return;

        // Request last close message from Discord
        channel.fetchMessage(this.data.lastCloseMessage)
        .then(closeMessage => {
            // Find all users that raised their hand
            const reactions = closeMessage.reactions.get("✋");
            if (reactions) {

                const usersToMention = reactions.users.array().filter(user => !user.bot);
                channel.send(usersToMention.join(", ") + "\n");
            }

            this.sendOnThisDayMessage(channel);
            this.data.questions = [];
        })
        .catch(reason => {
            console.warn("Failed getting last close message: " + reason);
            this.sendOnThisDayMessage(channel);
        });
    }

    sendOnThisDayMessage(channel: Discord.TextChannel) {
        
        const onThisDayMsg = fetch('https://history.muffinlabs.com/date')
        .then(r => r.json())
        .then(({ data: { Events } }) => Events[Math.floor(Math.random() * Events.length)])
        .then(event => { 
            channel.send(`On this day in ${event.year}, ${event.text}`);
        })
        .catch(r => console.warn('Failed to fetch message of the day: ' + r));
    }

    close(channel: Discord.TextChannel) {
        if (!this.data.isOpen) return;
        this.data.isOpen = false;

        channel.send(this.sharedSettings.officehours.closeMessage.replace(/{botty}/g, this.bot.user.toString()))
        .then(message => {
            if (Array.isArray(message)) {
                message = message[0];
            }

            this.data.lastCloseMessage = message.id;
            message.react("✋");
        });
    }
}


const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr2.some(x => arr1.has(x));
};