import Discord = require("discord.js");
import prettyMs = require("pretty-ms");

class Violator {
  public response : Discord.Message;
  public author : Discord.User;
  public messageContent : string;
};

export default class SpamKiller {
  private violators : Violator[] = [];
  private acceptedUsers : string[] = [];

  constructor(bot: Discord.Client) {
    bot.on("messageReactionAdd", this.onReaction.bind(this));
    bot.on("message", async(message: Discord.Message) => {
      if (!message.guild || message.author.bot) return;

      if (message.content.indexOf("http://") < 0 && message.content.indexOf("https://") < 0)
        return;

      const timeSinceJoin = ((new Date()).getTime() - message.member.joinedAt.getTime());

      if (timeSinceJoin > 1000 * 60 * 60 * 24)
        return;

      if (this.acceptedUsers.find(u => message.author.id == u))
        return;

      const author = message.author;
      const messageContent = message.cleanContent;
      if (message.deletable)
        await message.delete();
        
      if (this.violators.find(v => message.author.id == v.author.id))
        return;

      const timeMessage = prettyMs(timeSinceJoin, { verbose: true });
      let response = await message.channel.send(`Sorry, ${message.author.username}, but since you joined ${timeMessage} ago, I cannot let you post links without verification yet. Can you react to this message with a thumbs up when it appears?`);

      if (Array.isArray(response)) 
        response = response[0];
      this.violators.push({ messageContent, response, author });
      
      await response.react("👍");
    });
  }
  
  public async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
    if (user.bot) return;
    const deletedEntry = this.violators.find(v => v.response.id == messageReaction.message.id && v.author.id == user.id);
    
    if (!deletedEntry)
      return;

    await deletedEntry.response.channel.send(`${deletedEntry.author.username} just said: \n${deletedEntry.messageContent}`);
    await deletedEntry.response.delete();

    this.acceptedUsers.push(deletedEntry.author.id);
    const deletedId = this.violators.indexOf(deletedEntry);
    if (deletedId >= 0) 
      this.violators.splice(deletedId, 1);
  }
}
