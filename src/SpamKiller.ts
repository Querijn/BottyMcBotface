import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import { SharedSettings } from "./SharedSettings";
import url = require("url");

class Violator {
    public response: Discord.Message;
    public author: Discord.User;
    public messageContent: string;
}

export default class SpamKiller {
    private violators: Violator[] = [];
    private acceptedUsers: string[] = [];
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;

        bot.on("messageReactionAdd", this.onReaction.bind(this));
        bot.on("message", async (message: Discord.Message) => {
            if (!message.guild || message.author.bot) return;

            const httpOffset = message.content.indexOf("http://");
            const httpsOffset = message.content.indexOf("https://");
            if (httpOffset < 0 && httpsOffset < 0)
                return;

            // Get the url object parsed from the offset of the msg
            let urlString: string;
            if (httpOffset >= 0)
                urlString = message.content.substr(httpOffset);
            else // if (httpsOffset >= 0)
                urlString = message.content.substr(httpsOffset);

            const d = url.parse(urlString);
            const hostname = d.hostname || "";
            if (sharedSettings.spam.allowedUrls.findIndex(u => u.endsWith(hostname)) !== -1)
                return;

            const member = message.member ? message.member : await message.guild.members.fetch(message.author.id);
            if (!member)
                throw new Error(`Unable to find member that wrote the message '${message.content}' (${message.author.username})`);

            const timeSinceJoin = ((new Date()).getTime() - (member.joinedAt!.getTime() || 0));

            if (timeSinceJoin > 1000 * 60 * 60 * 24)
                return;

            if (this.acceptedUsers.find(u => message.author.id === u))
                return;

            const author = message.author;
            const messageContent = message.cleanContent;
            if (message.deletable)
                await message.delete();

            if (this.violators.find(v => message.author.id === v.author.id))
                return;

            let response = await message.channel.send(`Hey, ${message.author}, we require users to verify that they are human before they are allowed to post a link. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍`);

            if (Array.isArray(response))
                response = response[0];
            this.violators.push({ messageContent, response, author });

            await response.react("👍");
        });
    }

    public async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
        if (user.bot) return;

        // Find the deleted entry
        const deletedEntry = this.violators.find(v => v.response.id === messageReaction.message.id);
        if (!deletedEntry)
            return;

        // Has to be our user, or an admin
        if (deletedEntry.author.id !== user.id) {

            // Get the member of the thumbs up
            const member = await messageReaction.message.guild?.members.fetch(user.id);
            if (!member) return;

            // Is it an admin?
            if (!this.sharedSettings.commands.adminRoles.some(x => member.roles.cache.has(x)))
                return;
        }

        await deletedEntry.response.channel.send(`${deletedEntry.author.username} just said: \n${deletedEntry.messageContent}`);
        await deletedEntry.response.delete();

        this.acceptedUsers.push(deletedEntry.author.id);
        const deletedId = this.violators.indexOf(deletedEntry);
        if (deletedId >= 0)
            this.violators.splice(deletedId, 1);
    }
}
