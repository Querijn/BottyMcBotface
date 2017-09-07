import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

export default class AutoReact {
    private bot: Discord.Client;
    private thinkingUsers: string[];
    private greetingEmoji: Discord.Emoji;

    constructor(bot: Discord.Client, userFile: string) {
        console.log("Requested Thinking extension..");
        this.bot = bot;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onThinking.bind(this));
    }

    onBot() {
        console.log("Thinking extension loaded.");
        
        let emoji = this.bot.emojis.get("355252071882162176");
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("message", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        }
    }

    onThinking(message: Discord.Message) {
        if (message.content.startsWith("!original_thinko_reacts_only") && this.thinkingUsers.indexOf(message.author.id) === -1) {
            this.thinkingUsers.push(message.author.id);

            message.reply("I will now discriminate for you. !no_more_original_thinkos to stop.");
            return;
        } else if (message.content.startsWith("!no_more_original_thinkos") && this.thinkingUsers.indexOf(message.author.id) !== -1) {
            const index = this.thinkingUsers.indexOf(message.author.id);
            this.thinkingUsers.splice(index, 1);

            message.reply("REEEEEEEEEEEEEEEEE");
            return;
        }

        if (!message.content.includes("🤔")) return;

        if (this.thinkingUsers.indexOf(message.author.id) === -1) {
            const emoji = message.guild.emojis.filter(x => x.name.includes("thinking")).random();
            if (emoji) {
                message.react(emoji);
                return;
            }
        }

        message.react("🤔");
    }

    onGreeting(message: Discord.Message) {
        let greeting = message.content.toLowerCase();

        if (!greeting.startsWith("hello") 
            && !greeting.startsWith("hi ") && greeting != "hi"
            && !greeting.startsWith("hey ") && greeting != "hey")
            return;

        message.react(this.greetingEmoji);
    }
}
