import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import { SharedSettings } from "./SharedSettings";
import url = require("url");

class Violator {
    public response: Discord.Message | null;
    public authorId: string;
    public authorUsername: string;
    public messageContent: string;
    public violations = 0;
}

export default class SpamKiller {
    private bot: Discord.Client;
    private guild: Discord.Guild;
    private role: Discord.Role;

    private violators: Violator[] = [];
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.bot = bot;

        bot.on("messageReactionAdd", this.onReaction.bind(this));
        bot.on("message", this.onMessage.bind(this));
        bot.on("ready", this.onReady.bind(this));
    }

    async onReady() {
        const guild = this.bot.guilds.cache.get(this.sharedSettings.server.guildId);
        if (!guild) {
            console.error(`SpamKiller: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }
        this.guild = guild;

        const role = this.guild.roles.cache.find((r) => r.name === "ok");
        if (!role) {
            console.error(`SpamKiller: Unable to find the role!`);
            return;
        }
        this.role = role;
    }

    async onMessage(message: Discord.Message) {
        if (!message.guild || message.author.bot)
            return;

        const httpOffset = message.content.indexOf("http://");
        const httpsOffset = message.content.indexOf("https://");

        // Get the url object parsed from the offset of the msg
        let urlString: string;
        if (httpOffset >= 0)
            urlString = message.content.substr(httpOffset);
        else if (httpsOffset >= 0)
            urlString = message.content.substr(httpsOffset);
        else
            return;

        const d = url.parse(urlString);
        const hostname = d.hostname || "";
        if (this.sharedSettings.spam.allowedUrls.findIndex(u => u.endsWith(hostname)) !== -1)
            return;

        const member = message.member ? message.member : await message.guild.members.fetch(message.author.id);
        if (!member)
            throw new Error(`Unable to find member that wrote the message '${message.content}' (${message.author.username})`);

        if (member.roles.cache.size > 1) // Only act on people without roles
            return;

        console.log(`SpamKiller: ${message.author.username} posted: '${message.content}', deleting the message..`);
        const author = message.author;
        const messageContent = message.cleanContent;
        if (message.deletable)
            message.delete();

        // If we've asked them to verify, don't ask again
        const violator = this.violators.find(v => message.author.id === v.authorId);
        if (violator) {
            violator.violations++;
            if (violator.violations > 2 && violator.response) { // Just delete the response message when they spam it constantly
                await violator.response.delete();
                await member.kick();
                violator.response = null;
            }
            return;
        }

        let response = await message.channel.send(`Hey, ${message.author}, we require users to verify that they are human before they are allowed to post a link. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍`);

        if (Array.isArray(response))
            response = response[0];
        this.violators.push({ messageContent, response, authorId: author.id, authorUsername: author.username, violations: 1 });

        await response.react("👍");
    }

    async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
        if (user.bot) return;

        // Find the deleted entry
        const deletedEntry = this.violators.find(v => v.response?.id === messageReaction.message.id);
        if (!deletedEntry)
            return;

        // Has to be our user, or an admin
        if (deletedEntry.authorId !== user.id) {

            // Get the member of the thumbs up
            const member = await messageReaction.message.guild?.members.fetch(user.id);
            if (!member) return;

            // Is it an admin?
            if (!this.sharedSettings.commands.adminRoles.some(x => member.roles.cache.has(x)))
                return;
        }

        await deletedEntry.response?.channel.send(`${deletedEntry.authorUsername} just said: \n${deletedEntry.messageContent}`);
        await deletedEntry.response?.delete();

        const member = await this.guild.members.fetch(deletedEntry.authorId);
        member.roles.add(this.role);

        const deletedId = this.violators.indexOf(deletedEntry);
        if (deletedId >= 0)
            this.violators.splice(deletedId, 1);
    }
}
