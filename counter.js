const { 
    EmbedBuilder, 
    ChannelType
} = require('discord.js');
const cron = require('node-cron');
const logger = require('./logger.js');
const { 
    creatorChannelId, 
    creatorLogChannelId, 
    creatorTiers,
    weeklyRecapChannelId,
    bestPostChannelId,
    weeklyRecapTime,
    weeklyRecapEmbed
} = require('./config.json');

// --- Scheduled Tasks ---
function setupCronJobs(client, state, saveState) {
    const [hour, minute] = weeklyRecapTime.split(':');
    const cronSchedule = `${minute} ${hour} * * 0`;
    
    cron.schedule(cronSchedule, async () => {
        console.log("Running Weekly Recap & Best Post CRON Job...");
        try {
            // 1. Weekly Recap Logic
            let topCreatorId = null;
            let highestCount = 0;
            for (const [userId, data] of Object.entries(state.weeklyCreatorStreaks)) {
                if (data.postCount > highestCount) {
                    highestCount = data.postCount;
                    topCreatorId = userId;
                }
            }
            if (topCreatorId && highestCount > 0) {
                const recapChannel = client.channels.cache.get(weeklyRecapChannelId);
                if (recapChannel && recapChannel.type === ChannelType.GuildText) {
                    const recapEmbed = new EmbedBuilder()
                        .setColor(weeklyRecapEmbed.color)
                        .setTitle(weeklyRecapEmbed.title)
                        .setDescription(`Let's give a huge round of applause to our most active creator this week!`)
                        .addFields(
                            { name: 'Top Creator', value: `<@${topCreatorId}>`, inline: true },
                            { name: 'Posts This Week', value: `${highestCount}`, inline: true }
                        )
                        .setTimestamp();
                    await recapChannel.send({ embeds: [recapEmbed] });
                }
            }

            // 2. Best Post Showcase Logic
            if (state.weeklyPosts && state.weeklyPosts.length > 0) {
                const sortedPosts = [...state.weeklyPosts].sort((a, b) => b.votes - a.votes);
                const bestPost = sortedPosts[0];
                if (bestPost && bestPost.votes > 0) {
                    const showcaseChannel = client.channels.cache.get(bestPostChannelId);
                    if (showcaseChannel && showcaseChannel.type === ChannelType.GuildText) {
                        const showcaseEmbed = new EmbedBuilder()
                            .setColor('#FF4500')
                            .setTitle('🌟 Creator Showcase: Best Post of the Week! 🌟')
                            .setDescription(`This week's community favorite was posted by <@${bestPost.authorId}> with **${bestPost.votes}** votes!`)
                            .setImage(bestPost.mediaUrl)
                            .setTimestamp()
                            .setFooter({ text: 'Keep posting amazing content!' });
                        await showcaseChannel.send({ content: `@everyone`, embeds: [showcaseEmbed] });
                    }
                }
            }

            // 3. Reset State
            state.weeklyCreatorStreaks = {};
            state.weeklyPosts = [];
            await saveState();
            console.log("Weekly reset completed successfully.");
        } catch (error) {
            console.error("Error during weekly cron job execution:", error);
        }
    });

    console.log(`✅ Weekly Cron Job scheduled for ${hour}:${minute} every Sunday.`);
}

async function handleLeaderboardCommand(interaction, state) {
    await interaction.deferReply();

    const creatorsArray = Object.entries(state.creatorStreaks).map(([userId, data]) => {
        return {
            userId: userId,
            postCount: data.postCount,
            tierName: data.currentTierName || 'Novice'
        };
    });
    
    creatorsArray.sort((a, b) => b.postCount - a.postCount);
    const totalCreators = creatorsArray.length;
    const topCreators = creatorsArray.slice(0, 10);

    const leaderboardEmbed = new EmbedBuilder()
        .setColor('#FFAC33') // Premium Amber
        .setAuthor({ 
            name: `${interaction.guild.name} • Creator Leaderboard`, 
            iconURL: interaction.guild.iconURL() 
        })
        .setTitle('✨ THE CREATOR HALL OF FAME ✨')
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3112/3112946.png') // Trophy icon
        .setTimestamp()
        .setFooter({ text: `Excellence is a habit • Total Contributors: ${totalCreators}` });

    if (topCreators.length === 0) {
        leaderboardEmbed.setDescription('```ansi\n\u001b[1;31mNo legends have emerged yet. Will you be the first? \u001b[0m\n```');
    } else {
        // Fetch users to ensure they are available
        await Promise.all(
            topCreators.map(creator => 
                interaction.client.users.fetch(creator.userId).catch(() => null)
            )
        );

        let description = "```ansi\n\u001b[1;37mRank  Creator             Posts\u001b[0m\n";
        description += "──────────────────────────────────\n";

        topCreators.forEach((creator, index) => {
            const medal = index === 0 ? '👑' : index === 1 ? '⭐' : index === 2 ? '✨' : ` ${index + 1} `;
            const user = interaction.client.users.cache.get(creator.userId);
            const username = user ? (user.globalName || user.username) : 'Unknown User';
            const paddedName = username.substring(0, 15).padEnd(16, ' ');
            const paddedPosts = creator.postCount.toString().padStart(4, ' ');
            
            // Highlight top 3 with white/bold using ANSI if supported or just clean text
            if (index < 3) {
                description += `\u001b[1;33m${medal}  ${paddedName}  ${paddedPosts}\u001b[0m\n`;
            } else {
                description += ` ${medal}  ${paddedName}  ${paddedPosts}\n`;
            }
        });

        description += "──────────────────────────────────\n";
        description += "```\n";
        
        // Add Mentions for easy identification below the block
        let mentions = "**Top Contenders:**\n";
        topCreators.slice(0, 3).forEach((creator, i) => {
            mentions += `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} <@${creator.userId}>\n`;
        });
        
        leaderboardEmbed.setDescription(description + "\n" + mentions);
    }

    await interaction.editReply({ embeds: [leaderboardEmbed] });
    logger.logEvent(interaction.client, state, 'Leaderboard Command', `Leaderboard requested by ${interaction.user.tag}.`);
}

async function handleMessageCreate(message, state, saveState) {
    if (message.author.bot || message.channel.id !== creatorChannelId) return;

    const hasMedia = message.attachments.some(
        att => att.contentType?.startsWith('image/') || att.contentType?.startsWith('video/')
    );
    if (!hasMedia) return;

    const userId = message.author.id;
    const now = new Date();
    const today = now.toDateString();

    if (!state.creatorStreaks[userId]) {
        state.creatorStreaks[userId] = { postCount: 0, lastPostTimestamp: 0, currentTierName: null };
    }
    const userData = state.creatorStreaks[userId];

    // --- Production-Ready Daily Limit ---
    const lastPostTime = userData.lastPostTimestamp || 0;
    const isSameDay = new Date(lastPostTime).toDateString() === today;

    if (isSameDay && userData.postCount > 0) {
        logger.logEvent(message.client, state, "Post Limit Info", `${message.author.tag} uploaded a new post (already counted a post today).`, '#f1c40f');
        return; // BLOCK DOUBLE POSTS
    }
    
    // Update streaks
    userData.postCount++;
    userData.lastPostTimestamp = now.getTime();
    
    await saveState();

    logger.logEvent(message.client, state, "Post Counted", `${message.author.tag} uploaded a new post! Total count: **${userData.postCount}**`, '#2ecc71');

    if (!state.weeklyCreatorStreaks[userId]) {
        state.weeklyCreatorStreaks[userId] = { postCount: 0 };
    }
    state.weeklyCreatorStreaks[userId].postCount++;

    // React with the voting emoji
    try {
        await message.react('⭐');
    } catch (error) {
        console.error("Failed to react to message:", error);
    }

    state.weeklyPosts.push({
        messageId: message.id, // Using the original message ID for tracking reactions
        authorId: userId,
        mediaUrl: message.attachments.first().url,
        votes: 0,
        voters: [] // Changed from votedUsers to voters
    });

    let newTier = null;
    for (const tier of [...creatorTiers].reverse()) {
        if (userData.postCount >= tier.count) {
            newTier = tier;
            break;
        }
    }

    if (newTier && newTier.name !== userData.currentTierName) {
        userData.currentTierName = newTier.name;
        if (message.member) {
            await updateCreatorRoles(message.member, newTier);
            await sendAchievementMessage(message.client, message.member, newTier, userData.postCount);
        }
    }
    await saveState();
}

async function handleReactionAdd(reaction, user, state, saveState) {
    if (user.bot) return;

    // Handle partials
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    if (reaction.emoji.name !== '⭐') return;

    const messageId = reaction.message.id;
    const postIndex = state.weeklyPosts.findIndex(post => post.messageId === messageId);
    if (postIndex === -1) return;

    const post = state.weeklyPosts[postIndex];

    // Ensure voters array exists (migrate if necessary)
    if (!post.voters) {
        post.voters = post.votedUsers || [];
        if (post.votedUsers) delete post.votedUsers;
    }

    // Self-voting prevention
    if (user.id === post.authorId) {
        try {
            await reaction.users.remove(user.id);
            logger.logEvent(reaction.client, state, "Self-Vote Prevented", `${user.tag} tried to vote for their own post.`, '#e74c3c');
        } catch (error) {
            console.error("Failed to remove self-reaction:", error);
        }
        return;
    }

    if (!post.voters.includes(user.id)) {
        post.voters.push(user.id);
        post.votes++;
        await saveState();
        logger.logEvent(reaction.client, state, "Vote Added", `${user.tag} voted for <@${post.authorId}>'s post. Total votes: **${post.votes}**`, '#e67e22');
    }
}

async function handleReactionRemove(reaction, user, state, saveState) {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    if (reaction.emoji.name !== '⭐') return;

    const messageId = reaction.message.id;
    const postIndex = state.weeklyPosts.findIndex(post => post.messageId === messageId);
    if (postIndex === -1) return;

    const post = state.weeklyPosts[postIndex];

    // Ensure voters array exists (migrate if necessary)
    if (!post.voters) {
        post.voters = post.votedUsers || [];
        if (post.votedUsers) delete post.votedUsers;
    }

    const voterIndex = post.voters.indexOf(user.id);
    if (voterIndex !== -1) {
        post.voters.splice(voterIndex, 1);
        post.votes = Math.max(0, post.votes - 1);
        await saveState();
        logger.logEvent(reaction.client, state, "Vote Removed", `${user.tag} removed their vote from <@${post.authorId}>'s post. Total votes: **${post.votes}**`, '#95a5a6');
    }
}

async function updateCreatorRoles(member, newTier) {
    try {
        const allTierRoleIds = creatorTiers.map(t => t.roleId).filter(id => id !== "");
        const rolesToRemove = member.roles.cache.filter(
            role => allTierRoleIds.includes(role.id) && role.id !== newTier.roleId
        );
        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);
        if (newTier.roleId && !member.roles.cache.has(newTier.roleId)) {
            await member.roles.add(newTier.roleId);
        }
    } catch (error) {
        console.error(`Failed to update roles for ${member.user.tag}:`, error);
    }
}

async function sendAchievementMessage(client, member, tier, count) {
    const achievementEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🌟 Achievement Unlocked! 🌟')
        .setDescription(`${member.user} has achieved a new creator rank!`)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'New Rank', value: `**${tier.name}**`, inline: true },
            { name: 'Total Posts', value: `**${count}**`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Keep up the great work!' });

    try {
        const logChannel = await client.channels.fetch(creatorLogChannelId);
        if (logChannel && logChannel.type === ChannelType.GuildText) await logChannel.send({ embeds: [achievementEmbed] });
    } catch (error) {
        console.error("Failed to send achievement to log channel:", error);
    }

    try {
        await member.send({ embeds: [achievementEmbed] });
    } catch (error) {
        console.log(`Could not DM user ${member.user.tag}.`);
    }
}

module.exports = {
    setupCronJobs,
    handleLeaderboardCommand,
    handleMessageCreate,
    handleReactionAdd,
    handleReactionRemove
};
