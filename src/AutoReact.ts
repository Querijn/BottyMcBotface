import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import InteractionManager, { InteractionCommandData } from "./InteractionManager";
import Discord = require("discord.js");

export default class AutoReact {
    private thinkingUsers: string[];
    private ignoreUsers: string[];
    private thinkingEmojis: Discord.Emoji[] = [];
    private greetingEmoji: Discord.Emoji;
    private sharedSettings: SharedSettings;
    private bot: Discord.Client;
    private interactionManager;

    constructor(bot: Discord.Client, interactionManager: InteractionManager, sharedSettings: SharedSettings, userFile: string, ignoreFile: string) {
        console.log("Requested Thinking extension..");

        this.sharedSettings = sharedSettings;
        this.bot = bot;
        this.interactionManager = interactionManager;

        this.thinkingUsers = fileBackedObject(userFile);
        console.log("Successfully loaded original thinking user file.");

        this.ignoreUsers = fileBackedObject(ignoreFile);
        console.log("Successfully loaded ignore reaction file.");

        this.bot.on("ready", this.onConnect.bind(this));
        this.bot.on("messageCreate", this.onMessage.bind(this));

        this.registerInteractionCommands();
    }
    public registerInteractionCommands() {
        const commands : InteractionCommandData[] = [];

        const toggleReactionCommand = new Discord.SlashCommandBuilder()
            .setName("toggle_react")
            .setDescription("Toggles reacting to greeting messages")
            .toJSON();
        commands.push({body: toggleReactionCommand, adminOnly: false, handler: this.onInteraction.bind(this)});

        const toggleThinkingCommand = new Discord.SlashCommandBuilder()
            .setName("toggle_thinking")
            .setDescription("Toggles adding thinking reacts to your message").toJSON();
        commands.push({body: toggleThinkingCommand, adminOnly: false, handler: this.onInteraction.bind(this)});

        const refreshThinkingCommand = new Discord.SlashCommandBuilder()
            .setName("refresh_thinking")
            .setDescription("Refresh thinking emojis").toJSON();
        commands.push({body: refreshThinkingCommand, adminOnly: true, handler: this.onInteraction.bind(this)});

        commands.forEach(cmd => this.interactionManager.addSlashCommand(cmd.body, true, false, cmd.handler))
    }
    public onConnect() {
        this.refreshThinkingEmojis();

        const emoji = this.bot.emojis.cache.get(this.sharedSettings.autoReact.emoji);
        if (emoji instanceof Discord.Emoji) {
            this.greetingEmoji = emoji;
            this.bot.on("messageCreate", this.onGreeting.bind(this));
            console.log("Bot has succesfully loaded greetings.");
        } else {
            console.error(`Unable to find the greeting emoji '${this.sharedSettings.autoReact.emoji}'.`);
        }
    }

    public onToggleDefault(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        this.onToggleThinkingRequest(message, message.author.id);
    }

    public onRefreshThinking(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        message.reply("reloading thinking emojis.");
        this.refreshThinkingEmojis();
    }

    public onToggleReact(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        this.onToggleReactRequest(message, message.author.id);
    }
    public onInteraction(interaction: Discord.CommandInteraction, isAdmin?: false) {
        switch (interaction.commandName) {
            case "refresh_thinking":
                if (!isAdmin) return interaction.reply({content: "You don't have permission to use this command", ephemeral: true})
                this.refreshThinkingEmojis();
                interaction.reply({content: "Refreshed thinking emojis", ephemeral: true});
                break;
            case "toggle_thinking":
                this.onToggleThinkingRequest(interaction, interaction.user.id)
                break;
            case "toggle_react":
                this.onToggleReactRequest(interaction, interaction.user.id);
                break;
        }
    }
    private onMessage(message: Discord.Message) {
        // Only react to people not on list
        if (this.ignoreUsers.indexOf(message.author.id) !== -1) return;

        if (!message.content.includes("🤔")) {

            // If it's not the regular thinking emoji, maybe it's one of our custom ones?
            const emojiIds = /<:(.*?):([0-9]+)>/g.exec(message.content);
            if (!emojiIds) return;

            let found = false;
            for (let i = 2; i < emojiIds.length; i += 3) {
                const emojiFound = emojiIds[i];
                if (!this.thinkingEmojis.some((e: Discord.Emoji) => e.id === emojiFound)) {
                    continue;
                }

                found = true;
                break;
            }

            if (!found) return;
        }

        // If original thinking user
        if (this.thinkingUsers.indexOf(message.author.id) !== -1) {
            message.react("🤔");
            return;
        }

        // Otherwise use our custom ones
        const emoji = message.guild!.emojis.cache.filter((x: Discord.Emoji) => x.name !== null && this.isThinkingEmojiName(x.name)).random();
        if (emoji) {
            message.react(emoji);
            return;
        }
    }

    private onToggleReactRequest(message: Discord.Message | Discord.CommandInteraction, authorId: string) {

        const reactIndex = this.ignoreUsers.indexOf(authorId);
        const resp = (message instanceof Discord.CommandInteraction) ? {content: "", ephemeral: true} : {content: ""};

        // Add
        if (reactIndex === -1) {
            this.ignoreUsers.push(authorId);
            resp.content = "I will no longer react to your messages";
            message.reply(resp);
            return;
        }

        // Remove
        this.ignoreUsers.splice(reactIndex, 1);
        resp.content = "I will now react to your messages"
        message.reply(resp);
    }

    private onToggleThinkingRequest(message: Discord.Message | Discord.CommandInteraction, authorId: string) {

        const thinkIndex = this.thinkingUsers.indexOf(authorId);
        const resp = (message instanceof Discord.CommandInteraction) ? {content: "", ephemeral: true} : {content: ""};
        // Add
        if (thinkIndex === -1) {
            this.thinkingUsers.push(authorId);
            resp.content = "I will now only reply with default thinking emojis.";
            message.reply(resp);
            return;
        }

        // Remove
        this.thinkingUsers.splice(thinkIndex, 1);
        resp.content = "I will no longer only reply with default thinking emojis."
        message.reply(resp);
    }

    private onGreeting(message: Discord.Message) {

        if (message.author.bot) return;
        const greeting = message.content.toLowerCase();

        const words = [
            // Russian
            "privet", "preevyet", "privyet",
            "zdrastvooyte", "dobraye ootro",
            "привет",
            // ASBO
            "oi", "ey",
            // English
            "hello", "hi", "hey",
            "good morning", "goodmorning",
            "good evening", "goodevening",
            "good night", "goodnight",
            "good day", "goodday",
            "top of the morning",
            // French
            "bonjour", "salut", "coucou",
            // Spanish
            "buenos días", "buenos dias",
            "buenas tardes", "buenas noches",
            "muy buenos", "hola", "saludos",
            // Portuguese
            "ola", "olá", "boa tarde", "bom dia", "boa noite",
            // Hindi
            "namaste", "suprabhātam",
            "śubha sandhyā", "śubha rātri",
            // Bengali
            "nomoskar", "shubho shokal",
            "shubho oporanno", "shubho shondha",
            // Japanese
            "おはよう　ございます", "こんにちは",
            "ohayou gozaimasu", "konichiwa",
            "ohayō gozaimasu", "konnichiwa",
            "こんばんは", "おやすみ　なさい",
            "konbanwa", "oyasumi nasai",
            // Dutch
            "hallo", "hoi", "hey",
            "goede morgen", "goedemorgen",
            "goedenavond",
            "goedenacht", "goede nacht",
            "goedendag", "houdoe",
            // Montenegrian
            "zdravo", "ćao", "hej",
            "dobro jutro", "jutro",
            "dobro veče", "laku noć",
            "dobar dan", "dobar dan",
            // indonesian
            "selamat pagi",
        ];

        const endChars = [
            " ", "!", ",", ".",
        ];

        // Determine if the greeting is just the greeting, or ends in punctuation and not "his"
        const shouldReact = words.some(x => {
            if (greeting === x) { return true; }

            const endChar = greeting.charAt(x.length);
            return greeting.startsWith(x) && endChars.findIndex(y => y === endChar) !== -1;
        });

        if (!shouldReact) {
            return;
        }

        if (this.ignoreUsers.indexOf(message.author.id) !== -1) {
            return;
        }

        message.react(`${this.greetingEmoji.id}`);
    }

    private isThinkingEmojiName(emojiName: string) {
        return emojiName.toLowerCase().includes("think") || emojiName.toLowerCase().includes("thonk");
    }

    private refreshThinkingEmojis() {
        this.thinkingEmojis = Array.from(this.bot.emojis.cache.filter((x: Discord.Emoji) => x.name != null && this.isThinkingEmojiName(x.name)).values())
    }
}
