/** Humanitarian and crisis-focused RSS feeds (no API key required). */

export const HUMANITARIAN_RSS_FEEDS = [

  {

    name: "ReliefWeb Updates",

    url: "https://reliefweb.int/updates/rss.xml",

  },

  {

    name: "UN News",

    url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",

  },

  {

    name: "UN OCHA Global",

    url: "https://www.unocha.org/rss.xml",

  },

  {

    name: "UN OCHA ReliefWeb",

    url: "https://reliefweb.int/organization/unocha/rss.xml",

  },

  {

    name: "IFRC News",

    url: "https://www.ifrc.org/rss/news",

  },

  {

    name: "Google News Humanitarian",

    url: "https://news.google.com/rss/search?q=humanitarian+crisis+OR+disaster+relief&hl=en-US&gl=US&ceid=US:en",

  },

  {

    name: "Google News Conflict",

    url: "https://news.google.com/rss/search?q=armed+conflict+OR+displacement+OR+refugee&hl=en-US&gl=US&ceid=US:en",

  },

] as const;

