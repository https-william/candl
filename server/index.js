const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { NlpManager } = require('node-nlp');

const app = express();
const PORT = process.env.PORT || 5000;
const ALPHA_VANTAGE_API_KEY = 'GU27JX9L5OK8RHLR'; 

app.use(cors());

const manager = new NlpManager({ languages: ['en'] });

const fetchRedditSentiment = async (symbol) => {
  try {
    const response = await axios.get(
      `https://www.reddit.com/search.json?q=${symbol}&sort=new&limit=10`,
      { headers: { 'User-Agent': 'stock-sentiment-app/1.0.0' } }
    );

    let sentimentScore = 0;
    let postCount = 0;

    for (const post of response.data.data.children) {
      const text = post.data.title + ' ' + post.data.selftext;
      if (text.length > 0) {
        const result = await manager.process('en', text);
        sentimentScore += result.sentiment.score;
        postCount++;
      }
    }

    const averageSentiment = postCount > 0 ? sentimentScore / postCount : 0;
    return {
      averageSentiment: averageSentiment,
      postCount: postCount,
    };
  } catch (error) {
    console.error('Error fetching Reddit data:', error);
    return { averageSentiment: 0, postCount: 0 };
  }
};

app.get('/api/stock-data/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  try {
    const stockResponse = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
    );
    const sentimentData = await fetchRedditSentiment(symbol);

    res.json({
      stockData: stockResponse.data,
      sentimentData: sentimentData,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});