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
    public origMessageId?: string;
    public violations = 0;
}

interface ClassifierResponse {
    spam_confidence: number,
    mtime: number
}

class ClassifierHTTPError extends Error {}

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
    private tldList: string[];

    private classifierFlaggedUsers: Map<string, Discord.Message> = new Map();
    private guruLogChannel: Discord.GuildBasedChannel | undefined;
    private tempUserExemptions = new Map<string, number>();

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
        bot.on("clientReady", this.onReady.bind(this));
        bot.on("interactionCreate", this.onInteraction.bind(this));
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
        try { 
            let tldListReq = await fetch("https://data.iana.org/TLD/tlds-alpha-by-domain.txt");
            let tldListResp = await tldListReq.text();

            this.tldList = tldListResp.split(/\r?\n/).map((entry: string) => "." + entry);
            this.tldList.shift() // Remove comment from first line of list
        }
        catch {
            console.error("Failed to load TLD list")
        }
        this.guruLogChannel = this.bot.guilds.cache.find(gc => gc.id == this.sharedSettings.server.guildId)?.channels.cache.find(cc => cc.name == this.sharedSettings.server.guruLogChannel && cc.type == Discord.ChannelType.GuildText);
        setInterval(() => {
            const date = new Date().getTime();
            for (const [userId, message] of this.classifierFlaggedUsers) {
                if (date-message.createdTimestamp > 5 * 60 * 1000) {
                    this.classifierFlaggedUsers.delete(userId);
                }
            }
        }, 60 * 5 * 1000);
    }

    async onMessage(message: Discord.Message) {
        if (!message.guild || message.author.bot)
            return;
        // Stop Botty from acting on message on AutoMod alert channel
        if (message.member && !(message.guild.channels.cache.find(c => c.id == message.channelId)?.permissionsFor(message.member)?.has(Discord.PermissionFlagsBits.SendMessages, true)))
            return;

        // Functions return true if they delete the message. This makes sure that a message only gets deleted once
        this.checkInviteLinkSpam(message) ||
        this.checkForAttachments(message) ||
        this.checkForLinks(message) || 
        this.checkForGunbuddy(message) || 
        this.checkForPlayerSupport(message) || 
        await this.checkExternalClassifier(message) ||
        this.checkForCryptoWords(message) || 
        this.checkForDupes(message) || 
        this.checkForFlood(message) ||
        this.checkForMisleadingLinks(message);

        if (!message.member) return; // This shouldn't happen but...
        const memberMessageHistory = this.messageHistory.get(message.member?.id) || [];
        memberMessageHistory.push(message);
        this.messageHistory.set(message.member.id, memberMessageHistory);
    }
    checkInviteLinkSpam(message: Discord.Message) {
        if (!message.guild) return false;
        const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/([a-z0-9-]+)/i;
        const bad = ['nsfw', 'onlyfans', 'nudes', '18+', '+18', 'egirls', '🍑'];
        if (inviteRegex.test(message.content)) {
            const inviteLinks = message.content.match(inviteRegex) || [];
            for (const link of inviteLinks) {
                this.bot.fetchInvite(link).then(inviteInfo => {
                    if (!inviteInfo.guild) return;
                    const guildNameLower = inviteInfo.guild.name.toLowerCase().split(" ");
                    const hasBad = bad.some(word => guildNameLower.includes(word));
                    if (!hasBad) return false;
                    message.delete().catch(console.error);
                    if (message.member?.kickable) {
                        message.member.kick("Spamming NSFW invite links");
                        console.log(`SpamKiller: Removing <@${message.author.id}> from the server for spamming NSFW invite links`);
                        if (this.guruLogChannel instanceof Discord.TextChannel) {
                            this.guruLogChannel.send(`SpamKiller: Removing <@${message.author.id}> from the server for spamming NSFW invite links`);
                        }
                    }
                    else {
                        console.log(`SpamKiller: <@${message.author.id}> appears to be spamming NSFW links but isn't kickable`);
                    }
                }).catch(() => {});
            }
        }
        return false;
    }
    checkForMisleadingLinks(message: Discord.Message) {
        const reportChannel = this.bot.guilds.cache.find(gc => gc.id == this.sharedSettings.server.guildId)?.channels.cache.find(cc => cc.name == this.sharedSettings.server.guruLogChannel && cc.type == Discord.ChannelType.GuildText);
        //let links = message.content.match(/(\[(https?:\/\/.*?)\]\((https:\/\/.*?)\)/g);
        let links = message.content.match(/(\[.*?\])(\(<?https:\/\/.*?\)\>?)/g);

        let misleading: string[][] = [];
        links?.forEach(link => {
            let linkText = link.substring(1, link.indexOf("]"));
            if (this.tldList.some(k => linkText.indexOf(k) !== -1)) misleading.push([link, linkText])
        })
        if (misleading.length == 0) return false;
        console.log("SpamKiller: misleading links found in message id " + message.id);
        let report = misleading.map(entry => `\`\`\`${entry[0]}\`\`\` != ${entry[1]}`).join("\n")
        if (reportChannel && reportChannel instanceof Discord.TextChannel) reportChannel.send(`SpamKiller: Message with potentially misleading links posted by <@${message.author.id}> in <#${message.channel.id}> (https://discordapp.com/channels/${message.guild?.id}/${message.channel.id}/${message.id})\n` + report);
        return true;
    }
    checkForFlood(message: Discord.Message) {
        const time = new Date().getTime() - (this.floodMessageTime);
        const messageHistory = this.fetchMessageCache(message.member!, time);

        if (messageHistory.length >= this.floodMessageThreshold) {
            this.addViolatingMessage(message, `Hey <@${message.author.id}>, stop spamming!`, false, true);
            return true;
        }

        return false;
    }

    checkForDupes(message: Discord.Message) {
        const time = new Date().getTime() - (this.dupeMessageTime);
        const messageHistory = this.fetchMessageCache(message.member!, time);

        const dupeMessages = messageHistory.filter(messageHistoryEntry => message.content == messageHistoryEntry.content);
        if (dupeMessages.length >= this.dupeMessageThreshold) {
            this.addViolatingMessage(message, `Hey <@${message.author.id}>, Stop spamming!`, false, true);
            return true;
        }

        return false;
    }

    /** Checks if a user sends a messsage containing words related to crypto and triggers the bot check in that case */
    checkForCryptoWords(message: Discord.Message) {
        const cryptoWords = ["crypto", "blockchain", "web3", " nft", "$", "€", "bitcoin", " btc", "btc ", "ethereum", " eth", " eth"];
        const mentionsCrypto = cryptoWords.some(word => message.content.toLowerCase().indexOf(word) !== -1);
        if (!mentionsCrypto) return false;

        const embed = new Discord.EmbedBuilder()
            .setTitle("Robot Check")
            .setColor(0xffcc00)
            .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
            .setDescription("We require users to verify that they are human before they are allowed to send messages that include certain keywords. If you are a human, react with :+1: to this message. If you are a bot, please go spam somewhere else. 👍");

        this.addViolatingMessage(message, {content: `Hey, ${message.author} If you are a human, react with :+1: to this message`, embeds: [embed] });
        return true;
    }    

    checkForPlayerSupport(message: Discord.Message) {
        const wordList1 = ['ban', 'banned', 'hacked', 'stolen', 'suspended'];
        const wordList2 = ['dev', 'ticket', 'support', 'admin', 'help'];
        const exemptWords = ['127.0.0.1', 'localhost', 'portal', 'console', 'python', 'lcu'];

        const splitWords = (message.cleanContent+" ").match(/\b(\w+\W+)/g) || [];
        const words = splitWords.map(w => w.toLowerCase()
            .replace(/[,-\.\/\?]/g, "") // No garbage
            .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g,'') // No emoji
            .trim());

        let mentionsBanOrHack = wordList1.some(wl => words.indexOf(wl) !== -1);
        let mentionsSupport = wordList2.some(wl => words.indexOf(wl) !== -1);
        let mentionsExempt = exemptWords.some(wl => words.indexOf(wl) !== -1);

        if (mentionsBanOrHack && mentionsSupport && !mentionsExempt) {
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

            return true;
        }

        return false;
    }

    checkForGunbuddy(message: Discord.Message) {
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

            return true;
        }

        return false;
    }
    checkForAttachments(message: Discord.Message) {
        if (message.attachments.size >= 1) {
            const embed = new Discord.EmbedBuilder()
                .setTitle("Robot Check")
                .setColor(0xffcc00)
                .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
                .setDescription("We require users to verify that they are human before they are allowed to post an attachment. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍");
            this.addViolatingMessage(message, {content: `Hey, ${message.author} If you are a human, react with :+1: to this message`, embeds: [embed] });
        }
    }
    checkForLinks(message: Discord.Message) {
        const httpOffset = message.content.indexOf("http://");
        const httpsOffset = message.content.indexOf("https://");

        // Get the url object parsed from the offset of the msg
        let urlString: string;
        if (httpOffset >= 0)
            urlString = message.content.substr(httpOffset);
        else if (httpsOffset >= 0)
            urlString = message.content.substr(httpsOffset);
        else
            return false;

        const d = url.parse(urlString);
        const hostname = d.hostname || "";
        if (this.sharedSettings.spam.allowedUrls.findIndex(u => hostname.endsWith(u) &&
        (hostname.replace(u, "").endsWith(".") || hostname.replace(u, "").length === 0)) !== -1) // Only allow matching base domain (zero length after replace) and subdomains (ends with ".")
            return false;

        if (this.sharedSettings.spam.blockedUrls.findIndex((blockedUrl => hostname == blockedUrl)) !== -1) {
            // Exempt admins
            if (this.sharedSettings.commands.adminRoles.some(x => message.member && message.member.roles.cache.has(x))) return false;

            console.log(`SpamKiller: ${message.author} posted: '${message.content}' which contains a blocked url, deleting the message..`);
            // Not using addViolatingMessage because affecting people with ok roles is intentional
            const reportChannel = this.bot.guilds.cache.find(gc => gc.id == this.sharedSettings.server.guildId)?.channels.cache.find(cc => cc.name == this.sharedSettings.server.guruLogChannel && cc.type == Discord.ChannelType.GuildText);
            if (reportChannel) (reportChannel as Discord.TextChannel).send(`SpamKiller: ${message.author.username} (${message.author.id}) posted blocked url ${urlString}`);
            if (message.content.indexOf("(HOW)") !== -1) { message.member?.kickable ? message.member?.kick("Crypto spam").then(() => { message.channel.isSendable() && message.channel.send("🛫") }) : ""}
            message.delete();
            return true;
        }

        // Attempt to stop Mr Beast spam images
        const cdnLinkCount = message.content.match(/https:\/\/cdn\.discordapp\.com\/\S+/gi)?.length || 0;
        if (cdnLinkCount >= 3) {
            const embed = new Discord.EmbedBuilder()
                .setTitle("Message Removed")
                .setColor(0xffcc00)
                .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
                .setDescription("Your message matches a known spam pattern and was disallowed.");
            this.addViolatingMessage(message, {content: `Hey, ${message.author} Your message matches a known spam pattern and was disallowed.`, embeds: [embed] }, false);
            return true;
        }

        const embed = new Discord.EmbedBuilder()
            .setTitle("Robot Check")
            .setColor(0xffcc00)
            .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
            .setDescription("We require users to verify that they are human before they are allowed to post a link. If you are a human, react with :+1: to this message to gain link privileges. If you are a bot, please go spam somewhere else. 👍");
        this.addViolatingMessage(message, {content: `Hey, ${message.author} If you are a human, react with :+1: to this message`, embeds: [embed] });

        return true;
    }

    async checkExternalClassifier(message: Discord.Message) {
        if (!message.channel.isSendable()) return false;
        if (!message.guild) return false;
        // Exempt gurus
        if (message.member?.roles.cache.hasAny(...this.sharedSettings.commands.adminRoles)) return false;
        // Check temporary exemptions
        const exemptInfo = this.tempUserExemptions.get(message.author.id);
        if (exemptInfo && exemptInfo > Date.now()) {
            return false;
        }

        try {
            const response = await this.queryExternalAntiSpam(message);
            if (response === false) return false;

            if (response.spam_confidence > .80) {
                let extraInfo;
                let channelDelete;
                if (message.channel instanceof Discord.ThreadChannel) {
                    const threadMessageList = await message.channel.messages.fetch({ limit: 1, after: "0" });
                    if (threadMessageList.first()?.id === message.id) {
                        channelDelete = true;
                    }
                }
                await message.delete();
                const logMessageInfo = await (this.guruLogChannel as Discord.TextChannel)?.send(this.createClassifierRemovalEmbed(message, response));
                if (logMessageInfo && logMessageInfo.id) extraInfo = `[Guru Info](https://discord.com/channels/${message.guild.id}/${logMessageInfo.channelId}/${logMessageInfo.id})`
                const removalMessage = await message.channel.send(this.createClassifierRemovalUserMessage(message, response, extraInfo))
                this.violators.push({ response: removalMessage, messageContent: message.content, authorId: message.author.id, authorUsername: message.author.username, origMessageId: message.id, violations: 1 });
                console.log(`SpamKiller: ${message.author} posted: '${message.content}', deleting the message..`);

                if (channelDelete) {
                        removalMessage.reply("Thread will be removed in 30 seconds").catch(console.error);
                        setTimeout(() => message.channel.delete().catch(console.error).then(() => logMessageInfo?.reply("Thread removed")), 30 * 1000);
                }
                return true;
            }
            else if (response.spam_confidence && typeof response.spam_confidence === "number" && response.spam_confidence > .60) {
                console.log(`SpamKiller: Message in <#${message.channelId}> is potentially spam https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id} Confidence: ${response.spam_confidence}\nContent: ${message.cleanContent}`);
                if (this.guruLogChannel instanceof Discord.TextChannel) {
                    this.guruLogChannel.send(`SpamKiller: Message in <#${message.channelId}> is potentially spam https://discord.com/channels/${message.guild.id}/${message.channelId}/${message.id} Confidence: ${response.spam_confidence}\nContent: ${message.cleanContent}`).catch(() => {});
                }
                this.classifierFlaggedUsers.set(message.author.id + "_" + message.channel.id, message);
            }
            return false;
        }
        catch (e) {
            if (e instanceof ClassifierHTTPError) {
                console.warn(e, e.stack);
            }
            else {
                console.debug(e,e.stack);
            }
        }
        return false;
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
        if (message.channel instanceof Discord.ThreadChannel && (message.channel.parentId == "978519681184964629" || message.channel.parentId == "978514449352777798" || message.channel.parent instanceof Discord.ForumChannel)) {
            return console.log(`SpamKiller: ${message.author.username}#${message.author.discriminator}'s message triggered our spam detector, but channel has an exemption. (https://discordapp.com/channels/${message.guild?.id}/${message.channel.id}/${message.id})`);
        }

        console.log(`SpamKiller: ${message.author} posted: '${message.content}', deleting the message..`);
        const author = message.author;
        const messageContent = message.cleanContent;
        if (message.deletable)
            message.delete().catch(console.error);

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
        if (allowThrough) {}
        if (!message.channel.isSendable()) return false;
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

        // Limit to thumbs up
        if (messageReaction.emoji.name != "👍") {
            return;
        }
        // Has to be our user, or an admin
        if (deletedEntry.authorId !== user.id) {

            // Get the member of the thumbs up
            const member = await messageReaction.message.guild?.members.fetch(user.id);
            if (!member) return;

            // Is it an admin?
            if (!this.sharedSettings.commands.adminRoles.some(x => member.roles.cache.has(x)))
                return;
        }
        if (!deletedEntry.response?.channel.isSendable()) return false;
        console.log(`SpamKiller: ${user.username} (${user.id}) reacted with ${messageReaction.emoji.name}, reposting the message`);
        if (deletedEntry.messageContent.length == 0) {
            await deletedEntry.response?.channel.send(`<@${deletedEntry.authorId}>, you may repost your message`);
        }
        else {
            await deletedEntry.response?.channel.send(`<@${deletedEntry.authorId}> (${deletedEntry.authorUsername}) just said: \n${deletedEntry.messageContent}`);
        }
        await deletedEntry.response?.delete();

        const member = await this.guild.members.fetch(deletedEntry.authorId);
        member.roles.add(this.role);

        const deletedId = this.violators.indexOf(deletedEntry);
        if (deletedId >= 0)
            this.violators.splice(deletedId, 1);
    }
    async onInteraction(interaction: Discord.Interaction) {
        if (!interaction.isButton() || !interaction.customId.startsWith("spamkiller_")) return; // Not our button to respond to
        if (!interaction.guild
            || (!interaction.member || !(interaction.member.roles instanceof Discord.GuildMemberRoleManager)) 
            || (!interaction.member.roles.cache.hasAny(...this.sharedSettings.commands.adminRoles))) {
                return await interaction.reply({ content: "Permission denied", flags: Discord.MessageFlags.Ephemeral });
        }

        let repost = false;
        const origMessageId = interaction.customId.substring(interaction.customId.lastIndexOf("_")+1);
        const violationEntry = this.violators.find(v => v.origMessageId == origMessageId);

        const externalAntiSpamServiceEnabled = this.sharedSettings.spam.externalAntiSpamServiceEnabled;
        const externalAntiSpamServiceURL = this.sharedSettings.spam.externalAntiSpamServiceURL;
        if (!externalAntiSpamServiceEnabled || !externalAntiSpamServiceURL)
            return interaction.reply("The Anti-Spam service is currently disabled");
        if (!violationEntry) {
            return interaction.update({ components: []}).then(() => interaction.followUp("Couldn't find violating message with id " + origMessageId));
        }
        if (interaction.customId.startsWith("spamkiller_tempexempt_")) {
            const user = this.guild.members.cache.get(violationEntry.authorId)
            if (!user) {
                return interaction.reply({content: "Unable to find that user in the cache"});
            }
            this.tempUserExemptions.set(user.id, Date.now() + 15 * 60 * 1000);
            interaction.reply({content: `Temporarily exempted <@${user.id}>`});
        }
        else if (interaction.customId.startsWith("spamkiller_notspam_") || interaction.customId.startsWith("spamkiller_confirmspam_")) {
            // DELETE = not spam, PATCH = use as additional training data
            const method = (interaction.customId.startsWith("spamkiller_notspam_")) ? "DELETE" : "PATCH";

            await interaction.reply("Update requested to classifier");
            let result = await fetch(externalAntiSpamServiceURL, { 
                method: method,
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({text: violationEntry.messageContent})
            });
            if (result.ok)
                interaction.followUp("Update success");
            if (method == "DELETE")
                repost = true;
        }
        if (repost) {
            if (!violationEntry.response?.channel.isSendable()) return false;
            await violationEntry.response?.channel.send(`<@${violationEntry.authorId}> (${violationEntry.authorUsername}) just said: \n${violationEntry.messageContent}`);
            await violationEntry.response?.delete();
        }
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
    private async queryExternalAntiSpam(message: Discord.Message) {
        if (!message.guild) return false;
        const externalAntiSpamServiceEnabled = this.sharedSettings.spam.externalAntiSpamServiceEnabled;
        const externalAntiSpamServiceURL = this.sharedSettings.spam.externalAntiSpamServiceURL;

        if (!externalAntiSpamServiceEnabled || !externalAntiSpamServiceURL) return false;
        const flaggedUserMessage = this.classifierFlaggedUsers.get(message.author.id + "_" + message.channel.id);
        let messageContent = message.content;
        if (flaggedUserMessage && new Date().getTime()-flaggedUserMessage.createdTimestamp < 5 * 60 * 1000) {
            messageContent = flaggedUserMessage.content + "\n" + message.content;
        }
        let result = await fetch(externalAntiSpamServiceURL, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({text: messageContent})
        });
        if (result.ok) {
            return await result.json() as ClassifierResponse;
        }
        throw new ClassifierHTTPError(`Classifer fetch failed with error code ${result.status} - ${result.statusText}`);
    }
    private fetchMessageCache(member: Discord.GuildMember, messageAfterTimestamp: number) {
        return (this.messageHistory.get(member.id) || [])
            .filter(mhEntry => mhEntry.createdTimestamp > messageAfterTimestamp) // Filter for time
            .filter(mhEntry => mhEntry.guild && (mhEntry.guild.id == member.guild.id)); // Filter for guild
    }
    private createClassifierRemovalEmbed(message: Discord.Message, classifierResponse: ClassifierResponse): Discord.MessageCreateOptions {
        return {
            content: `SpamKiller: Message in <#${message.channel.id}> (author: <@${message.author.id}>): Spam classifier removal threshold exceeded (score: ${classifierResponse.spam_confidence.toFixed(5)}), removing message\nContent: ${message.cleanContent}`,
            components: [
                new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
                .addComponents(
                    new Discord.ButtonBuilder()
                    .setCustomId("spamkiller_notspam_" + message.id)
                    .setLabel("Not Spam")
                    .setStyle(Discord.ButtonStyle.Primary)
                    ,
                    new Discord.ButtonBuilder()
                    .setCustomId("spamkiller_tempexempt_" + message.id)
                    .setLabel("Exempt temporarily")
                    .setStyle(Discord.ButtonStyle.Secondary)
                )
            ]
        }
    }
    private createClassifierRemovalUserMessage(message: Discord.Message, response: ClassifierResponse, extraInfo: string | undefined): Discord.MessageCreateOptions {
        return { 
            embeds: [
                new Discord.EmbedBuilder()
                .setTitle("Message Removed")
                .setThumbnail("https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Antu_dialog-warning.svg/240px-Antu_dialog-warning.svg.png")
                .setDescription(`<@${message.author.id}> Your message has been removed by an automated filter. If you believe this was an error, please contact a Guru or Admin.`)
                .addFields({ name: "\xa0", value: extraInfo || "\xa0" })
                .setFooter({ text: "v:" + response.mtime + " | Message scored " + response.spam_confidence.toPrecision(5) + ` | Message ID: ${ message.id }`})
            ]
        }
    }
}
