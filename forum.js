var Answerhub = require("./answerhub.js");
const FileSystem = require('fs');
const Discord = require('discord.js');

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

class ForumReader
{
    constructor(a_Bot, a_SettingsFile, a_DataFile, a_KeyFinder)
    {
        console.log("Requested ForumReader extension..");

        var t_SettingsData = FileSystem.readFileSync(a_SettingsFile, 'utf8');
        this.m_Settings = JSON.parse(t_SettingsData);
        this.m_SettingsFile = a_SettingsFile;
        console.log("Successfully loaded ForumReader settings file.");

        var t_Data = FileSystem.readFileSync(a_DataFile, 'utf8');
        this.m_Data = JSON.parse(t_Data);
        this.m_DataFile = a_DataFile;
        console.log("Successfully loaded ForumReader data file.");

        this.m_Bot = a_Bot;
        this.m_KeyFinder = a_KeyFinder;
        this.m_Answerhub = new Answerhub.API(this.m_Settings.URL, this.m_Settings.Username, this.m_Settings.Password);

        this.m_Needs = {};
        this.m_Questions = {};
        this.m_UnresolvedQuestions = {};

        this.m_Bot.on('ready', this.OnBot.bind(this));
        
        // TODO: Something less of a hack. I want to 'cache' these questions in case more answers come along,
        // but the memory needs to be freed. The issue is with the fact there might be a process running.
        setInterval(this.ClearQuestions.bind(this), 60 * 60 * 1000);
    }

    OnBot()
    {
        console.log("ForumReader extension loaded.");

        if (this.m_Data.Last["question"] == 0) 
            this.m_Data.Last["question"] = new Date().getTime();

        if (this.m_Data.Last["answer"] == 0) 
            this.m_Data.Last["answer"] = new Date().getTime();

        if (this.m_Data.Last["comment"] == 0) 
            this.m_Data.Last["comment"] = new Date().getTime();

        this.SaveData();
        this.FetchForumData();
    }

    SaveData()
    {
        FileSystem.writeFileSync(this.m_DataFile, JSON.stringify(this.m_Data));
    }

    RetryFailedQuestions()
    {
        for (var t_Key in this.m_UnresolvedQuestions) 
        {
            if (this.m_UnresolvedQuestions.hasOwnProperty(t_Key) == false)
                continue;

            if (this.m_Questions[t_Key] !== undefined && this.m_Questions[t_Key] !== null)
                continue;

            this.m_UnresolvedQuestions[t_Key]++;

            if (this.m_UnresolvedQuestions[t_Key] < 5)
            {
                this.m_Answerhub.GetArticle(this.AddQuestion.bind(this), t_Key);
            }    
            else console.error("Ran out of tries trying to get question " + t_Key);
        }   
    }

    AddQuestion(a_Error, a_Response, a_Body)
    {
        if (a_Error) 
        {
            console.error("Error while getting questions: " + a_Error.toString());
            this.RetryFailedQuestions();
            return;
        }

        if (a_Response.statusCode != 200) 
        {
            console.error("Incorrect status code while getting a specific question: " + a_Response.statusCode);
            this.RetryFailedQuestions();
            return;
        }

        let t_Question = JSON.parse(a_Body);
        this.m_Questions[t_Question.id] = t_Question;
        
        if(this.m_UnresolvedQuestions[t_Question.id] !== undefined)
            delete this.m_UnresolvedQuestions[t_Question.id];

        for (let t_Key in this.m_Needs) 
        {
            if (this.m_Needs.hasOwnProperty(t_Key) == false)
                continue;

            if (this.m_Needs[t_Key].Activity.originalParentId != t_Question.id)
                continue;

            this.FulfillNeed(t_Key);
        }
    }

    AddQuestionRequest(a_Activity, a_Message)
    {
        this.m_Needs[a_Activity.id] = 
        { 
            Activity: a_Activity, 
            QuestionID: a_Activity.originalParentId,
            Message: a_Message
        };

        this.m_UnresolvedQuestions[a_Activity.originalParentId] = 0;
        this.m_Answerhub.GetQuestion(this.AddQuestion.bind(this), a_Activity.originalParentId);
    }

    ClearQuestions()
    {
        this.m_Questions = {};
    }

    GetAvatar(a_Activity)
    {
        let t_UsernameIndex = a_Activity.author.username.indexOf('(');
        let t_RegionEndIndex = a_Activity.author.username.indexOf(')');
        let t_Region = (t_UsernameIndex == -1) ? "UNKNOWN" : a_Activity.author.username.substr(t_UsernameIndex + 1, t_RegionEndIndex - t_UsernameIndex - 1);
        let t_Username = (t_UsernameIndex == -1) ? a_Activity.author.username : a_Activity.author.username.substr(0, t_UsernameIndex - 1);

        return "http://avatar.leagueoflegends.com/" + encodeURIComponent(t_Region) + "/" + encodeURIComponent(t_Username) + ".png?t=" + encodeURIComponent(Math.random().toString());
    }

    async ReadActivity(a_Error, a_Response, a_Body)
    {
        try 
        {
            if (a_Error) 
            {
                console.error("Error while getting questions: " + a_Error.toString());
                return;
            }

            if (a_Response.statusCode != 200) 
            {
                console.error("Incorrect status code while getting questions: " + a_Response.statusCode);
                return;
            }

            let t_Guild = this.m_Bot.guilds.find("name", this.m_Settings.Server);
            if (typeof(t_Guild) === 'undefined' && t_Guild !== null)
            {
                console.error("Incorrect setting for the server: " + this.m_Settings.Server);
                return;
            }

            let t_Channel = t_Guild.channels.find("name", this.m_Settings.Channel);
            if (typeof(t_Channel) === 'undefined' && t_Channel !== null)
            {
                console.error("Incorrect setting for the channel: " + this.m_Settings.Channel);
                return;
            }

            let t_JSON = JSON.parse(a_Body);
            for (let i = t_JSON.list.length - 1; i >= 0; i--)
            {
                let t_Activity = t_JSON.list[i];
                if (t_Activity.creationDate <= this.m_Data.Last[t_Activity.type])
                    continue;

                let t_UsernameIndex = t_Activity.author.username.indexOf('(');
                let t_RegionEndIndex = t_Activity.author.username.indexOf(')');
                let t_Region = (t_UsernameIndex == -1) ? "UNKNOWN" : t_Activity.author.username.substr(t_UsernameIndex + 1, t_RegionEndIndex - t_UsernameIndex - 1);
                let t_Username = (t_UsernameIndex == -1) ? t_Activity.author.username : t_Activity.author.username.substr(0, t_UsernameIndex - 1);

                let t_Avatar = this.GetAvatar(t_Activity);
                let t_Embed = null;
                let t_RequiresQuestion = false;

                switch(t_Activity.type)
                {
                case "question":
                    t_Embed = new Discord.RichEmbed()
                        .setColor(0xC62F2F)
                        .setTitle(t_Activity.author.username + " asked '" + t_Activity.title + "'")
                        .setDescription(this.m_Answerhub.FormatBody(t_Activity.body))
                        .setURL(this.m_Answerhub.BaseURL + "questions/" + t_Activity.id + "/" + t_Activity.slug + ".html");
                    
                    this.m_KeyFinder.FindKey(t_Username, t_Activity.title, "the forum (in the title), at " + t_Embed.url);
                    break;

                case "answer":
                    t_Embed = new Discord.RichEmbed()
                        .setColor(0xD1F442)
                        .setTitle(t_Activity.author.username + " posted an answer")// on '" + t_Question.title + "'")
                        //.addField("Question", this.m_Answerhub.FormatBody(t_Question.body), false)
                        .addField(t_Activity.author.username + "'s answer", this.m_Answerhub.FormatBody(t_Activity.body), false)
                        .setTimestamp(new Date(t_Activity.creationDate))
                        .setThumbnail(t_Avatar)
                        .setURL(this.m_Answerhub.BaseURL + "questions/" + t_Activity.originalParentId + "/?childToView=" + t_Activity.id + "#answer-" + t_Activity.id);
                    
                        t_RequiresQuestion = true;
                    break;

                case "comment":
                    t_Embed = new Discord.RichEmbed()
                        .setColor(0x4FB9F7)
                        .setTitle(t_Activity.author.username + " posted a comment")// on '" + t_Question.title + "'")
                        .setDescription(this.m_Answerhub.FormatBody(t_Activity.body))
                        .setTimestamp(new Date(t_Activity.creationDate))
                        .setThumbnail(t_Avatar)
                        .setURL(this.m_Answerhub.BaseURL + "questions/" + t_Activity.originalParentId + "/?childToView=" + t_Activity.id + "#comment-" + t_Activity.id);

                    t_RequiresQuestion = true;
                    break;
                }
                
                if (t_Embed === null)
                    continue;

                this.m_KeyFinder.FindKey(t_Username, t_Activity.body, "the forum, at " + t_Embed.url);
                t_Embed.setTimestamp(new Date(t_Activity.creationDate))
                .setThumbnail(t_Avatar);

                let t_Message = await t_Channel.send("", { embed: t_Embed });
                if(t_RequiresQuestion) this.AddQuestionRequest(t_Activity, t_Message);

                this.m_Data.Last[t_Activity.type] = t_Activity.creationDate;
                this.SaveData();
            }
        }
        catch(t_Error)
        {
            console.error("Exception occurred reading forum: " + t_Error.message);
        }
    }

    FulfillNeed(a_Key)
    {
        try 
        {
            let t_Element = this.m_Needs[a_Key];

            if (this.m_Questions[t_Element.Activity.originalParentId] === undefined || this.m_Questions[t_Element.Activity.originalParentId] === null)
                return;

            if (t_Element.Message.embeds.length == 0)
                return;

            let t_Question = this.m_Questions[t_Element.Activity.originalParentId];
            let t_Embed = t_Element.Message.embeds[0];     
            let t_NewEmbed = new Discord.RichEmbed();
            for (var a_Key in t_NewEmbed) 
                if (t_NewEmbed.hasOwnProperty(a_Key))
                    t_NewEmbed[a_Key] = t_Embed[a_Key];
            
            t_NewEmbed.title = t_Embed.title + " on '" + t_Question.title + "'";

            let t_Avatar = this.GetAvatar(t_Element.Activity);
            t_NewEmbed.setThumbnail(t_Avatar);

            if(t_Element.Activity.type == "answer")
            {
                let t_Field = t_Embed.fields[0];
                t_NewEmbed.fields = 
                [
                    {
                        name: "Question", 
                        value: this.m_Answerhub.FormatBody(t_Question.body), 
                        inline: false
                    }, 
                    
                    // Gotta recreate this because of the bull that is in t_Field
                    {
                        name: t_Field.name, 
                        value: t_Field.value, 
                        inline: false
                    }
                ];
            }

            t_Element.Message.edit("", { embed: t_NewEmbed });

            //delete this.m_Questions[t_Element.Activity.id];
            delete this.m_Needs[a_Key];
        }
        catch(t_Error)
        {
            console.error("Exception occurred trying to add question data to activity: " + t_Error.message);
        }
    }

    FetchForumData()
    {
        try 
        {
            this.m_Answerhub.GetQuestions(this.ReadActivity.bind(this));
            this.m_Answerhub.GetAnswers(this.ReadActivity.bind(this));
            this.m_Answerhub.GetComments(this.ReadActivity.bind(this));
        }
        catch(t_Error)
        {
            console.error("Exception occurred fetching forum urls: " + t_Error.message);
        }

        setTimeout(this.FetchForumData.bind(this), this.m_Settings.CheckInterval);
    }
}

exports.ForumReader = ForumReader;