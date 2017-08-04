const Discord = require('discord.js');
const FileSystem = require('fs');

class Honeypot
{
    constructor(a_Bot, a_SettingsFile)
    {
        var t_Data = FileSystem.readFileSync(a_SettingsFile, 'utf8');
        this.m_Settings = JSON.parse(t_Data);
        console.log("Successfully loaded honeypot settings file.");

        this.m_JoinTime = (new Date()).getTime();
        this.m_Master = a_Bot;
        this.m_Client = new Discord.Client();

        this.m_Client
        .on('message', this.OnMessage.bind(this))
        .on('messageUpdate', this.OnMessageUpdate.bind(this))
        .on('guildCreate', this.OnJoin.bind(this))
        .on('error', console.error)
        .on('warn', console.warn)
        //.on('debug', console.log)
	    .on('disconnect', () => { console.warn('Honeypot disconnected!'); })
	    .on('reconnecting', () => { console.warn('Honeypot is reconnecting...'); })
	    .on('connect', () => { console.warn('Honeypot is connected.'); });

        this.m_Client.on('ready', (() => 
        {
            console.log("Honeypot is logged in and ready.");
        }).bind(this));

        this.m_Master.on('ready', (() => 
        {
            console.log("Honeypot's master is logged in and ready.");
            this.m_Client.login(this.m_Settings.Discord.Token);
        }).bind(this));

    }

    OnJoin(a_Guild)
    {
        console.error("Joined '" + a_Guild + "'");
        this.m_JoinTime = (new Date()).getTime();
    }

    get GetJoinedTime()
    {
        let t_TimeDifference = (new Date()).getTime() - this.m_JoinTime;
        if (t_TimeDifference > 1000)
            return Math.round(t_TimeDifference * 0.001) + " seconds";

        return t_TimeDifference + " milliseconds";
    }

    OnMessage(a_Message)
    {
        if(a_Message.channel.type !== 'dm')
            return;

        let t_CatchMessage = "Got a direct message " + this.GetJoinedTime + " after joining from " + a_Message.author.toString() + 
        ": ```" + a_Message.content + "```";
        this.ReportHoneypotCatch(t_CatchMessage);
    }

    OnMessageUpdate(a_OldMessage, a_NewMessage)
    {
        if(a_NewMessage.channel.type !== 'dm')
            return;

        let t_CatchMessage = "User updated a direct message " + this.GetJoinedTime + " after joining from " + a_NewMessage.author.toString() + 
        ": ```" + a_NewMessage.content + "``` Old message was: ```" + a_OldMessage.content + "```";
        this.ReportHoneypotCatch(t_CatchMessage);
    }

    ReportHoneypotCatch(a_Message)
    {
        console.warn(a_Message);
        let t_Channel = this.Channel;
        if (t_Channel === null)
            return;

        t_Channel.send(a_Message);
    }

    get Master()
    {
        return this.m_Master;
    }
    
    get Client()
    {
        return this.m_Client;
    }

    get Channel()
    {
        var t_Guild = this.m_Master.guilds.find("name", this.m_Settings.Server);
        if (typeof(t_Guild) === 'undefined')
        {
            console.error("Incorrect setting for the server: " + this.m_Settings.Server);
            return null;
        }

        var t_Channel = t_Guild.channels.find("name", this.m_Settings.ReportChannel);
        if (typeof(t_Channel) === 'undefined')
        {
            console.error("Incorrect setting for the channel: " + this.m_Settings.ReportChannel);
            return null;
        }

        return t_Channel;
    }
}

exports.Honeypot = Honeypot;


