const fs = require('fs');
const path = require('path');

const srcResearchDir = path.join(__dirname, '..', 'src', 'research');

const targetTopicCluster = [
  { id: 'agent-spend-guardrails', topic: 'AI Agent Spend Guardrails', targetQuery: 'ai agent spending limits and budget caps' },
  { id: 'ai-chargeback-showback', topic: 'AI Chargeback and Showback', targetQuery: 'how to chargeback llm costs by team' },
  { id: 'llm-usage-metering-billing', topic: 'LLM Usage Metering & Billing', targetQuery: 'metering and billing internal llm usage' },
  { id: 'llm-cost-monitoring', topic: 'LLM Cost Monitoring', targetQuery: 'realtime llm cost monitoring' },
  { id: 'ai-finops-cfo', topic: 'AI FinOps for CFOs', targetQuery: 'cfo guide to ai spend governance' },
  { id: 'prompt-caching-explained', topic: 'Prompt Caching ROI', targetQuery: 'prompt cache cost savings' },
  { id: 'model-routing', topic: 'Dynamic Model Routing', targetQuery: 'model routing cost optimization' },
];

function analyzeGaps() {
  console.log('Running Content Gap Analyzer (llmcfo)...');
  
  const existingFiles = fs.readdirSync(srcResearchDir);
  const existingArticles = existingFiles.map((f) => f.replace(/\.(njk|html|md)$/, ''));

  const gapAnalysis = targetTopicCluster.map((item) => {
    const covered = existingArticles.some((art) => art.includes(item.id) || art.includes(item.id.replace(/-/g, '')));
    return {
      topic: item.topic,
      targetQuery: item.targetQuery,
      covered,
      suggestedSlug: `research/${item.id}`,
      priority: covered ? 'Covered' : 'High Gap',
    };
  });

  const coveredCount = gapAnalysis.filter((g) => g.covered).length;
  const gapCount = gapAnalysis.length - coveredCount;

  const result = {
    timestamp: new Date().toISOString(),
    totalTargetTopics: gapAnalysis.length,
    coveredCount,
    gapCount,
    gapAnalysis,
  };

  const outputPath = path.join(__dirname, '..', 'content-gaps.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`Content Gap Analysis Complete: ${coveredCount}/${gapAnalysis.length} topics covered. ${gapCount} gaps identified.`);
}

analyzeGaps();
