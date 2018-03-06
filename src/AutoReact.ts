import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";

import Discord = require("discord.js");

export default class AutoReact {
    private bot: Discord.Client;
    private thinkingUsers: string[];
	private reactIgnore: string[];
    private greetingEmoji: Discord.Emoji;
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, userFile: string, ignoreFile: string) {
        console.log("Requested Thinking extension..");
        this.bot = bot;

        this.sharedSettings = sharedSettings;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.bot.on("ready", this.onBot.bind(this));
        this.bot.on("message", this.onThinking.bind(this));
    }

    onBot() {
        console.log("Thinking extension loaded.");
        
        let emoji = this.bot.emojis.get(this.sharedSettings.autoReact.emoji);
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("message", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        }
        else {
            console.error(`Unable to find the greeting emoji '${this.sharedSettings.autoReact.emoji}'.`);
        }
    }

    onThinking(message: Discord.Message) {
		
		const authorId = message.author.id;
		const reactIndex = this.reactIgnore.indexOf(authorId);
			
		if(message.content.startsWith("!toggle_react") {
			if(reactIndex === -1) {
				this.reactIgnore.push(authorId);
				message.reply("I will no longer react to your messages");
			} else {
				this.reactIgnore.splice(index, 1);
				message.reply("I will now react to your messages");
			}
			
			return;
		} else if (message.content.startsWith("!original_thinko_reacts_only") && this.thinkingUsers.indexOf(authorId) === -1) {
            this.thinkingUsers.push(authorId);

            message.reply("I will now discriminate for you. !no_more_original_thinkos to stop.");
            return;
        } else if (message.content.startsWith("!no_more_original_thinkos") && this.thinkingUsers.indexOf(authorId) !== -1) {
            const index = this.thinkingUsers.indexOf(authorId);
            this.thinkingUsers.splice(index, 1);

            message.reply("REEEEEEEEEEEEEEEEE");
            return;
        }

        if (!message.content.includes("🤔")) return;
		if (reactIndex !== -1) return;
		
        if (this.thinkingUsers.indexOf(authorId) === -1) {
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

        if (!greeting.startsWith("hello ") && greeting != "hello"
            && !greeting.startsWith("hi ") && greeting != "hi"
            && !greeting.startsWith("hey ") && greeting != "hey"
            && !greeting.startsWith("good morning ") && greeting != "good morning"
            && !greeting.startsWith("goodmorning ") && greeting != "goodmorning"
            && !greeting.startsWith("good evening ") && greeting != "good evening"
            && !greeting.startsWith("goodevening ") && greeting != "goodevening"
            && !greeting.startsWith("good night ") && greeting != "good night"
            && !greeting.startsWith("goodnight ") && greeting != "goodnight"
            && !greeting.startsWith("goodday ") && greeting != "goodday"
            && !greeting.startsWith("good day ") && greeting != "good day")
            return;
			
		if (this.reactIgnore.indexOf(message.author.id) !== -1)
			return;

        message.react(this.greetingEmoji);
    }
}
