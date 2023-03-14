import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import { SharedSettings } from "./SharedSettings";
import url = require("url");
import { levenshteinDistance } from "./LevenshteinDistance";

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

        this.checkForLinks(message);
        this.checkForGunbuddy(message);
        this.checkForPlayerSupport(message);
    }

    async checkForPlayerSupport(message: Discord.Message) {
        const wordList1 = ['ban', 'banned', 'hacked', 'stolen'];
        const wordList2 = ['dev', 'ticket', 'support', 'admin']

        const memberJoinDateTime = message.guild!.member(message.author)!.joinedAt!.getTime()
        const currentDateTime = new Date().getTime()
        const splitWords = (message.cleanContent+" ").match(/\b(\w+\W+)/g) || [];
        const words = splitWords.map(w => w.toLowerCase()
            .replace(/[,-\.\/\?]/g, "") // No garbage
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'') // No emoji
            .trim());

        let mentionsBanOrHack = wordList1.some(wl => words.indexOf(wl) !== -1)
        let mentionsSupport = wordList2.some(wl => words.indexOf(wl) !== -1)

        if (mentionsBanOrHack && mentionsSupport && (currentDateTime-memberJoinDateTime) > 15*60*1000) {
            this.addViolatingMessage(message, `Hey, ${message.author}, This Discord server is for the Riot Games API, a tool which provides data to sites like op.gg. No one here will be able to help you with support or gameplay issues. If you're having account related issues or technical problems, contact Riot Games support: <https://support.riotgames.com/hc/en-us>. If you have a game-related suggestion or feedback, post on the relevant discord server (League: <https://discord.gg/lol>, Valorant: <https://discord.gg/valorant>)`, false)
        }
    }

    async checkForGunbuddy(message: Discord.Message) {
        const splitWords = (message.cleanContent+" ").match(/\b(\w+\W+)/g) || [];
        const words = splitWords.map(w => w.toLowerCase()
            .replace(/[,-\.\/\?]/g, "") // No garbage
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'') // No emoji
            .trim());

        // Check for "gunbuddy" or alike
        const gunbuddyLikenesses = words.map(w => levenshteinDistance(w, "gunbuddy"));
        let hasGunbuddyMessage = gunbuddyLikenesses.findIndex(l => l <= 2) >= 0; // if you're 2 characters off, add a violating message

        // Check for "gunbuddies" or alike
        if (!hasGunbuddyMessage) {
            const gunbuddiesLikenesses = words.map(w => levenshteinDistance(w, "gunbuddies"));
            hasGunbuddyMessage = gunbuddiesLikenesses.findIndex(l => l <= 2) >= 0; // if you're 2 characters off, add a violating message
        }

        // Check for "riotbuddy" or alike
        if (!hasGunbuddyMessage) {
            const riotBuddyLikeness = words.map(w => levenshteinDistance(w, "riotbuddy"));
            hasGunbuddyMessage = riotBuddyLikeness.findIndex(l => l <= 3) >= 0; // if you're 2 characters off, add a violating message
        }

        // Check for "riotbuddies" or alike
        if (!hasGunbuddyMessage) {
            const riotBuddyLikeness = words.map(w => levenshteinDistance(w, "riotbuddies"));
            hasGunbuddyMessage = riotBuddyLikeness.findIndex(l => l <= 3) >= 0; // if you're 2 characters off, add a violating message
        }

        // Check for "gun" and "buddy" or alike
        if (!hasGunbuddyMessage) {
            let gunWordIndices =        words.map((w, i) => levenshteinDistance(w, "gun")       <= 1 ? i : -1).filter(w => w >= 0);
            let riotWordIndices =       words.map((w, i) => levenshteinDistance(w, "riot")      <= 1 ? i : -1).filter(w => w >= 0)
            const buddyWordIndices =    words.map((w, i) => levenshteinDistance(w, "buddy")     <= 2 ? i : -1).filter(w => w >= 0);
            const buddiesWordIndices =  words.map((w, i) => levenshteinDistance(w, "buddies")   <= 2 ? i : -1).filter(w => w >= 0);
            gunWordIndices = gunWordIndices.concat(riotWordIndices);

            const hasBuddyWord = buddyWordIndices.findIndex(b =>     gunWordIndices.indexOf(b - 1) >= 0) >= 0;
            const hasBuddiesWord = buddiesWordIndices.findIndex(b => gunWordIndices.indexOf(b - 1) >= 0) >= 0;
            hasGunbuddyMessage = hasBuddyWord || hasBuddiesWord;
        }

        if (hasGunbuddyMessage) {
            this.addViolatingMessage(message, `Hey, ${message.author}, you triggered our spam detector. this is not a Riot Games server. There are no Rioters here, and no one can give you a gunbuddy. See <#914594958202241045> for more information.`, false);
        }
    }

    async checkForLinks(message: Discord.Message) {
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

        this.addViolatingMessage(message, `Hey, ${message.author}, we require users to verify that they are human before they are allowed to post a link. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍`);
    }

    async addViolatingMessage(message: Discord.Message, warningMessage: string, allowThrough: boolean = true) {

        const guild = <Discord.Guild>message.guild; // Got to explicitly cast away null because Typescript doesn't detect this
        if (!guild && !message.guild)
            throw new Error(`Unable to find the guild where this message was found: '${message.content}' (${message.author.username})`);

        const member = message.member ? message.member : await guild.members.fetch(message.author.id);
        if (!member)
            throw new Error(`Unable to find member that wrote the message '${message.content}' (${message.author.username})`);

        if (member.roles.cache.size > 1) { // Only act on people without roles
            console.log(`SpamKiller: ${message.author.username}#${message.author.discriminator}'s message triggered our spam detector, but they've got ${member.roles.cache.size} roles. (https://discordapp.com/channels/${message.guild?.id}/${message.channel.id}/${message.id})`);
            return;
        }

        console.log(`SpamKiller: ${message.author} posted: '${message.content}', deleting the message..`);
        const author = message.author;
        const messageContent = message.cleanContent;
        if (message.deletable)
            message.delete();

        // If we've asked them to verify, don't ask again
        const violator = this.violators.find(v => message.author.id === v.authorId);
        if (violator) {
            violator.violations++;
            if (message.mentions.everyone || violator.violations > 2) { // Just delete the response message when they spam it constantly
                if (violator.response)
                    violator.response.delete();

                try {
                    await member.send("Hey there! You've been kicked from the Riot Games Third Party Developer Discord because you triggered our spam filter. There's a good chance your account has been compromised, please change your password.");
                }
                catch {}

                await member.kick();
                violator.response = null;
            }
            return;
        }

        let response = await message.channel.send(warningMessage);

        if (Array.isArray(response))
            response = response[0];
        this.violators.push({ messageContent, response, authorId: author.id, authorUsername: author.username, violations: 1 });

        if (allowThrough) // Technically not the right way to do it, but whatever
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
