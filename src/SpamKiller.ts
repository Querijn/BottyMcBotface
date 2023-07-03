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

    private messageHistory = new Map<string, Discord.Message[]>();
    private floodCheckTimer: NodeJS.Timeout;
    private floodMessageThreshold: number;
    private floodMessageTime: number;
    private dupeMessageThreshold: number;
    private dupeMessageTime: number; 
    private maxMessageHistoryAge: number;

    private violators: Violator[] = [];
    private sharedSettings: SharedSettings;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        this.sharedSettings = sharedSettings;
        this.bot = bot;

        // Time is specified in seconds
        this.dupeMessageThreshold = this.sharedSettings.spam.duplicateMessageThreshold || 4;
        this.dupeMessageTime = (this.sharedSettings.spam.duplicateMessageTime || 30) * 1000; 
        this.floodMessageThreshold = this.sharedSettings.spam.floodMessageThreshold || 3;
        this.floodMessageTime = (this.sharedSettings.spam.floodMessageTime || 4) * 1000;
        this.maxMessageHistoryAge = Math.max(this.dupeMessageTime, this.floodMessageTime) * 2;

        bot.on("messageReactionAdd", this.onReaction.bind(this));
        bot.on("messageCreate", this.onMessage.bind(this));
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
        this.floodCheckTimer = setTimeout(this.messageHistoryCleanup.bind(this));
    }

    async onMessage(message: Discord.Message) {
        if (!message.guild || message.author.bot)
            return;

        this.checkForLinks(message);
        this.checkForGunbuddy(message);
        this.checkForPlayerSupport(message);
        this.checkForCryptoSpam(message);
        this.checkForDupes(message);
        this.checkForFlood(message);

        if (!message.member) return; // This shouldn't happen but...
        const memberMessageHistory = this.messageHistory.get(message.member?.id) || [];
        memberMessageHistory.push(message);
        this.messageHistory.set(message.member.id, memberMessageHistory);
        
    }

    async checkForFlood(message: Discord.Message) {
        const time = new Date().getTime() - (this.floodMessageTime);
        const messageHistory = this.fetchMessageCache(message.member!, time);

        if (messageHistory.length >= this.floodMessageThreshold) this.addViolatingMessage(message, `Hey <@${message.author.id}>, stop spamming!`, false, true);

    }

    async checkForDupes(message: Discord.Message) {
        const time = new Date().getTime() - (this.dupeMessageTime);
        const messageHistory = this.fetchMessageCache(message.member!, time);

        const dupeMessages = messageHistory.filter(messageHistoryEntry => message.content == messageHistoryEntry.content);
        if (dupeMessages.length >= this.dupeMessageThreshold) {
            this.addViolatingMessage(message, `Hey <@${message.author.id}>, Stop spamming!`, false, true);
        }
    }

    async checkForCryptoSpam(message: Discord.Message) {
        const cryptoKeywords = ['10individuals', 'crypto', 'commission'];

        if (!cryptoKeywords.every(word => message.content.indexOf(word) !== -1)) return;

        this.addViolatingMessage(message, `Hey <@${message.author.id}>, you seem to be spamming crypto messages`, false);
    }

    async checkForPlayerSupport(message: Discord.Message) {
        const wordList1 = ['ban', 'banned', 'hacked', 'stolen', 'suspended'];
        const wordList2 = ['dev', 'ticket', 'support', 'admin', 'help'];

        const splitWords = (message.cleanContent+" ").match(/\b(\w+\W+)/g) || [];
        const words = splitWords.map(w => w.toLowerCase()
            .replace(/[,-\.\/\?]/g, "") // No garbage
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'') // No emoji
            .trim());

        let mentionsBanOrHack = wordList1.some(wl => words.indexOf(wl) !== -1)
        let mentionsSupport = wordList2.some(wl => words.indexOf(wl) !== -1)

        if (mentionsBanOrHack && mentionsSupport) {
            const violationEmbed = new Discord.EmbedBuilder()
                .setTitle("There is no game or account support here")
                .setColor(0xff0000)
                .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/1/19/Stop2.png")
                .setDescription(`This Discord server is for the Riot Games API, a tool which provides data to sites like op.gg. No one here will be able to help you with support or gameplay issues. If you're having account related issues or technical problems, contact Player support. If you have game feedback, see the links below.`)
                .addFields([
                    {name: "Player Support", value: " [Player Support](https://support.riotgames.com/hc/en-us)", inline: true},
                    {name: "League", value: "[Discord](https://discord.gg/leagueoflegends)\n[Subreddit](https://reddit.com/leagueoflegends)", inline: true},
                    {name: "\u200b", value: "\u200b", inline: true},
                    {name: "Valorant", value: "[Discord](https://discord.gg/valorant)\n[Subreddit](https://reddit.com/valorant)", inline: true},
                    {name: "LoR", value: "[Discord](https://discord.gg/LegendsOfRuneterra)\n[Subreddit](https://reddit.com/r/LegendsofRuneterra)", inline: true},
                    {name: "\u200b", value: "\u200b", inline: true}
                ]);
            this.addViolatingMessage(message, {content: `Hey ${message.author}, There is no game or account support here`, embeds: [violationEmbed]}, false);
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
            const violationEmbed = new Discord.EmbedBuilder()
                .setTitle("There are no gun buddies here")
                .setColor(0xff0000)
                .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/1/19/Stop2.png")
                .setDescription(`You triggered our spam detector. this is not a Riot Games server. There are no Rioters here, and no one can give you a gunbuddy. See <#914594958202241045> for more information`)
            this.addViolatingMessage(message, {content: `Hey ${message.author}, there are no gun buddies here`, embeds: [violationEmbed]}, false);
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
        if (this.sharedSettings.spam.allowedUrls.findIndex(u => hostname.endsWith(u) &&
        (hostname.replace(u, "").endsWith(".") || hostname.replace(u, "").length === 0)) !== -1) // Only allow matching base domain (zero length after replace) and subdomains (ends with ".")
            return;

        const embed = new Discord.EmbedBuilder()
            .setTitle("Robot Check")
            .setColor(0xffcc00)
            .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
            .setDescription("We require users to verify that they are human before they are allowed to post a link. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍");
        this.addViolatingMessage(message, {content: `Hey, ${message.author} If you are a human, react with :+1: to this message`, embeds: [embed] });
    }

    async addViolatingMessage(message: Discord.Message, warningMessage: string | Discord.MessageCreateOptions, allowThrough: boolean = true, clearMessagesOnKick: boolean = false) {

        const guild = <Discord.Guild>message.guild; // Got to explicitly cast away null because Typescript doesn't detect this
        if (!guild && !message.guild)
            throw new Error(`Unable to find the guild where this message was found: '${message.content}' (${message.author.username})`);

        const member = message.member ? message.member : await guild.members.fetch(message.author.id);
        if (!member)
            throw new Error(`Unable to find member that wrote the message '${message.content}' (${message.author.username})`);

        if (member.roles.cache.filter(r => !this.sharedSettings.spam.ignoredRoles.includes(r.id)).size > 1) { // Only act on people without roles
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
                    violator.response.delete().catch(console.error);

                try {
                    await member.send("Hey there! You've been kicked from the Riot Games Third Party Developer Discord because you triggered our spam filter. There's a good chance your account has been compromised, please change your password.");
                }
                catch {}

                await member.kick().catch(console.error);
                if (clearMessagesOnKick) {
                    const userMessageHistory = this.messageHistory.get(member.id) || [];
                    const memberGuildMessageHistory = userMessageHistory.filter(mhEntry => mhEntry.guildId == member.guild.id);
                    const remainingEntries = userMessageHistory.filter(mhEntry => mhEntry.guildId != member.guild.id);
                    memberGuildMessageHistory.filter(mhEntry => mhEntry.id !== message.id).forEach(mhEntry => mhEntry.delete().catch(() => {}));
                    this.messageHistory.set(member.id, remainingEntries);
                }
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

    private messageHistoryCleanup() {
        const timeLimit = new Date().getTime() + (2 * 60 * 1000);
        for (const entry in this.messageHistory.keys()) {
            const userMessageList = this.messageHistory.get(entry) || []; 
            if (userMessageList.length === 0) this.messageHistory.delete(entry);
            else this.messageHistory.set(entry, userMessageList.filter(entry => entry.createdAt.getTime() > timeLimit))
        }
        if (this.floodCheckTimer) clearTimeout(this.floodCheckTimer);
        this.floodCheckTimer = setTimeout(this.messageHistoryCleanup.bind(this), this.maxMessageHistoryAge);
    }

    private fetchMessageCache(member: Discord.GuildMember, messageAfterTimestamp: number) {
        return (this.messageHistory.get(member.id) || [])
            .filter(mhEntry => mhEntry.createdTimestamp > messageAfterTimestamp) // Filter for time
            .filter(mhEntry => mhEntry.guild && (mhEntry.guild.id == member.guild.id)); // Filter for guild
    }
}
