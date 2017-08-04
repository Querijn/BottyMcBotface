const FileSystem = require('fs');

class Uptime
{
    constructor(a_Bot, a_SettingsFile, a_DataFile)
    {
        console.log("Requested uptime extension..");

        var t_Data = FileSystem.readFileSync(a_SettingsFile, 'utf8');
        this.m_Settings = JSON.parse(t_Data);
        console.log("Successfully loaded uptime settings file.");

		t_Data = FileSystem.readFileSync(a_DataFile, 'utf8');
        this.m_Data = JSON.parse(t_Data);
        this.m_DataFile = a_DataFile;
        console.log("Successfully loaded uptime data file.");

        this.m_Bot = a_Bot;
        this.m_Bot.on('ready', this.OnBot.bind(this));
        this.m_Bot.on('message', this.OnMessage.bind(this));
        setInterval(this.OnUpdate.bind(this), this.m_Settings.CheckInterval);
    }

    SaveData()
    {
        FileSystem.writeFileSync(this.m_DataFile, JSON.stringify(this.m_Data));
    }

    OnBot()
    {
        console.log("Uptime extension loaded.");
    }

    OnMessage(a_Message)
    {
        if(a_Message.content.startsWith("!uptime") === false)
            return;
        
        a_Message.reply("the bot has been up for " + this.UptimePercentage + "% of the time. Bot started " + this.Uptime + " ago.");
    }

    OnUpdate()
    {
        let t_TimeDifference = (new Date()).getTime() - this.m_Data.LastUptime;

        // To restart, basically set either of these values to 0
        if (this.m_Data.LastUptime == 0 || this.m_Data.UptimeStart == 0)
        {
            this.m_Data.UptimeStart = (new Date()).getTime();
            this.m_Data.TotalDowntime = 0;
            t_TimeDifference = 0;
        }

        if(t_TimeDifference > this.m_Settings.CheckInterval + 1000) // Give it some error
        {
            this.m_Data.TotalDowntime += t_TimeDifference;
            console.log("Noticed a downtime of " + (t_TimeDifference * 0.001) + " seconds.");
        }

        this.m_Data.LastUptime = (new Date()).getTime();
        this.SaveData();
    }

    get UptimePercentage() 
    {
        let t_Timespan = (new Date()).getTime() - this.m_Data.UptimeStart;
        let t_UptimePercentage = 1.0 - (this.m_Data.TotalDowntime / t_Timespan);
        // return Math.round(t_UptimePercentage * 100.0 * 10000.0) * 0.00001;
        return +(t_UptimePercentage * 100.0).toFixed(3);
    }

    AddS(a_Number)
    {
        return a_Number == 1 ? "" : "s";
    }

    get Uptime() 
    {
        var t_Message = "";
        var t_HasMessage = false;

        var t_MinuteLength = 60;
        var t_HourLength = t_MinuteLength * 60;
        var t_DayLength = t_HourLength * 24;
        var t_WeekLength = t_DayLength * 7;
        var t_YearLength = t_WeekLength * 52;
        
        var t_Seconds = Math.floor((new Date() - this.m_Data.UptimeStart) / 1000);

        // Count years
        var t_Interval = Math.floor(t_Seconds / t_YearLength);
        if (t_Interval >= 1)
        {
            t_Message += t_Interval + " year" + this.AddS(t_Interval);
            t_HasMessage = true;

            t_Seconds -= t_Interval * t_YearLength;
        }

        // Count weeks
        t_Interval = Math.floor(t_Seconds / t_WeekLength);
        if (t_Interval >= 1)
        {
            if (t_HasMessage) t_Message += ", ";
            t_Message += t_Interval + " week" + this.AddS(t_Interval);
            t_HasMessage = true;

            t_Seconds -= t_Interval * t_WeekLength;
        }

        // Count days
        t_Interval = Math.floor(t_Seconds / t_DayLength);
        if (t_Interval >= 1)
        {
            if (t_HasMessage) t_Message += ", ";
            t_Message += t_Interval + " day" + this.AddS(t_Interval);
            t_HasMessage = true;

            t_Seconds -= t_Interval * t_DayLength;
        }

        // Count hours
        t_Interval = Math.floor(t_Seconds / t_HourLength);
        if (t_Interval >= 1)
        {
            if (t_HasMessage) t_Message += ", ";
            t_Message += t_Interval + " hour" + this.AddS(t_Interval);
            t_HasMessage = true;

            t_Seconds -= t_Interval * t_HourLength;
        }

        // Count minutes
        t_Interval = Math.floor(t_Seconds / t_MinuteLength);
        if (t_Interval >= 1)
        {
            if (t_HasMessage) t_Message += ", ";
            t_Message += t_Interval + " minute" + this.AddS(t_Interval);
            t_HasMessage = true;

            t_Seconds -= t_Interval * t_MinuteLength;
        }
        
        if (t_HasMessage) t_Message += " and ";
        t_Message += t_Seconds + " second" + this.AddS(t_Seconds);
        
        return t_Message;
    }
}

exports.Uptime = Uptime;