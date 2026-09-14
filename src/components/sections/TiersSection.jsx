import React from 'react';
import { Icon } from '../ui/Icon';
import { waLink } from '../../lib/whatsapp';
import { AGENT_BY_KEY, AGENT_BY_KEY_AR } from '../../data/agents';
import { GROWTH_AGENTS } from '../../data/tiers';
import { AGENT_AVATARS } from '../../lib/agentAvatars';

// Packaged plans — Catch → Convert → Dominate ladder, with published pricing.
// Tier content comes from the `tiers` array (TIERS / TIERS_AR in pages/Home.jsx);
// section chrome (labels, terms, guarantee) comes from translations `t`.
// Each tier lists the roster agents it adds — resolved from data/agents.js by
// key, so the cards and the "Meet the AI team" section always name the same cast.
// CTAs go to WhatsApp with the plan name prefilled.
export function TiersSection({ t, tiers = [], lang = 'ar', trackEvent }) {
  const planMsg = (name) => (t.wa_msg_plan || 'Hi BznsFlow — I am interested in the {plan} plan.').replace('{plan}', name);
  const Check = () => <Icon name="check" size={15} strokeWidth={2.5} />;
  const roster = lang === 'ar' ? AGENT_BY_KEY_AR : AGENT_BY_KEY;

  // Western digits with thousands separators on both pages — the Arabic side
  // already writes numerals this way throughout (78%, 24/7, 5 مؤشرات).
  const num = (n) => n.toLocaleString('en-US');
  const currency = t.price_currency || 'OMR';

  // `bdi` isolates the price from the surrounding direction: without it the
  // bidi algorithm reorders "OMR 40" inside RTL text.
  const Price = ({ pricing }) => (
    <div className="pricing-cost">
      <div className="price-row">
        <bdi className="price-amount">{currency} {num(pricing.monthly)}</bdi>
        <span className="price-cadence">{t.price_per_month || '/month'}</span>
      </div>
      <bdi className="price-usd">≈ USD {num(pricing.monthlyUsd)} {t.price_per_month || '/month'}</bdi>
      <bdi className="price-setup">
        + {currency} {num(pricing.setup)} {t.price_setup || 'one-time setup'} · ≈ USD {num(pricing.setupUsd)}
      </bdi>
    </div>
  );

  // One chip = one agent's portrait, name, and role, read straight from the roster.
  // A missing portrait degrades to the agent's line icon rather than a blank circle.
  const AgentChip = ({ agentKey }) => {
    const agent = roster[agentKey];
    if (!agent) return null;
    return (
      <li className="tier-chip">
        <span className="tier-chip-avatar" aria-hidden="true">
          {AGENT_AVATARS[agentKey]
            ? <img src={AGENT_AVATARS[agentKey]} alt="" width="36" height="36" loading="lazy" decoding="async" />
            : <Icon name={agent.icon} size={18} strokeWidth={1.8} />}
        </span>
        <span className="tier-chip-meta">
          <span className="tier-chip-name">{agent.name}</span>
          <span className="tier-chip-role">{agent.role}</span>
        </span>
      </li>
    );
  };

  // Cumulative headcount for the comparison table — each tier inherits the ones below it.
  let running = 0;
  const teamCounts = tiers.map((tier) => (running += tier.agents?.length || 0));
  const teamCountLabel = (n) => (n === 1
    ? (t.compare_team_one || '1 agent')
    : (t.compare_team_many || '{n} agents').replace('{n}', n));
  const ladder = [
    { stage: t.ladder_1 || 'Catch',     sub: t.ladder_1_sub || 'Stop losing the leads you already pay for' },
    { stage: t.ladder_2 || 'Convert',   sub: t.ladder_2_sub || 'Turn the “not-yet” buyers into closings' },
    { stage: t.ladder_3 || 'Dominate',  sub: t.ladder_3_sub || 'Go take the market instead of waiting' },
  ];

  return (
    <section className="section section--dark" id="tiers">
      <div className="container">
        <h2 className="section-title" data-reveal dangerouslySetInnerHTML={{ __html: t.tiers_title }}></h2>
        <p className="section-subtitle" data-reveal>{t.tiers_sub}</p>

        {/* Ladder strip: Catch → Convert → Dominate */}
        <div className="pricing-ladder" data-reveal role="list">
          {ladder.map((step, i) => (
            <React.Fragment key={i}>
              <div className="ladder-step" role="listitem">
                <span className="ladder-index" aria-hidden="true">{i + 1}</span>
                <span className="ladder-stage">{step.stage}</span>
                <span className="ladder-sub">{step.sub}</span>
              </div>
              {i < ladder.length - 1 && (
                <span className="ladder-arrow" aria-hidden="true">
                  <Icon name="arrow-right" size={18} strokeWidth={2} className="icon-flip-rtl" />
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Tier cards */}
        <div className="pricing-grid">
          {tiers.map((tier) => (
            <div
              key={tier.key}
              className={`pricing-card pricing-card--ladder${tier.popular ? ' pricing-card--popular' : ''}`}
            >
              {tier.flag && <div className="popular-badge">{tier.flag}</div>}

              <div className="pricing-header">
                <div className="tier-stage-row">
                  <h3 className="pricing-tier">{tier.name}</h3>
                  <span className="tier-stage-tag">{tier.stage}</span>
                </div>
                {tier.pricing && <Price pricing={tier.pricing} />}
                <div className="tier-bottleneck">
                  <span className="tier-bottleneck-label">{t.tier_kills || 'Kills'}</span>
                  <span className="tier-bottleneck-text">{tier.bottleneck}</span>
                </div>
                <p className="pricing-desc">{tier.intro}</p>
              </div>

              <div className="tier-inside-label">{tier.insideLabel}</div>
              <ul className="pricing-features">
                {tier.inside.map((f, i) => (
                  <li key={i}><Check /> <span>{f}</span></li>
                ))}
              </ul>

              {tier.agents?.length > 0 && (
                <div className="tier-team">
                  <div className="tier-team-label">{t.tier_team || 'Team included'}</div>
                  <ul className="tier-team-chips">
                    {tier.agents.map((key) => <AgentChip key={key} agentKey={key} />)}
                  </ul>
                </div>
              )}

              <div className="tier-roi">
                <div className="tier-roi-row">
                  <span className="tier-roi-key">{t.tier_replaces || 'Replaces'}</span>
                  <span className="tier-roi-val">{tier.roiReplaces}</span>
                </div>
                <p className="tier-roi-line">{tier.roiLine}</p>
                <div className="tier-roi-row">
                  <span className="tier-roi-key">{t.tier_payback || 'Payback'}</span>
                  <span className="tier-roi-val tier-roi-val--accent">{tier.payback}</span>
                </div>
              </div>

              <p className="tier-pull">{tier.pull}</p>

              <a
                href={tier.key === 'catalyst' ? (lang === 'ar' ? '/layla/setup' : '/en/layla/setup') : waLink(planMsg(tier.name))}
                target={tier.key === 'catalyst' ? undefined : '_blank'}
                rel="noopener noreferrer"
                className={`btn ${tier.popular ? 'btn-primary' : 'btn-ghost'} pricing-btn`}
                onClick={() => trackEvent?.(tier.key === 'catalyst' ? 'LaylaSetupClick' : 'WhatsAppClick', { source: 'plan', plan: tier.name })}
              >
                <Icon name={tier.key === 'catalyst' ? 'arrow-up' : 'whatsapp'} size={18} />
                <span>{tier.key === 'catalyst' ? (lang === 'ar' ? 'إعداد ليلى' : 'Set up Layla') : tier.cta}</span>
              </a>

              {tier.nextStep && (
                <div className="tier-nextstep">
                  <span className="tier-nextstep-arrow" aria-hidden="true">
                    <Icon name="arrow-up" size={16} strokeWidth={2.5} />
                  </span>
                  <span>{tier.nextStep}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Growth pack — demand generation, sold beside the ladder rather than inside it */}
        <div className="growth-pack" data-reveal>
          <div className="growth-pack-head">
            <div className="growth-pack-label">{t.growth_label || 'Add-on'}</div>
            <h3 className="growth-pack-title">{t.growth_title || 'The Growth Pack'}</h3>
            <p className="growth-pack-body">{t.growth_body || 'Every plan above works the enquiries you already get. The Growth Pack goes and creates more of them — content, copy, search, and email, run by four specialists. Add it to any plan.'}</p>
          </div>
          <ul className="tier-team-chips growth-pack-chips">
            {GROWTH_AGENTS.map((key) => <AgentChip key={key} agentKey={key} />)}
          </ul>
          <a
            href={waLink(t.wa_msg_growth || 'Hi BznsFlow — tell me about the Growth Pack.')}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost growth-pack-btn"
            onClick={() => trackEvent?.('WhatsAppClick', { source: 'plan', plan: 'Growth Pack' })}
          >
            <Icon name="whatsapp" size={18} />
            <span>{t.growth_cta || 'Ask about the Growth Pack'}</span>
          </a>
        </div>

        {/* At-a-glance comparison */}
        <div className="pricing-compare" data-reveal>
          <div className="pricing-compare-scroll" tabIndex={0} role="region" aria-label={t.compare_label || 'Plan comparison'}>
            <table className="pricing-compare-table">
              <thead>
                <tr>
                  <th className="pc-rowhead">{t.compare_label || 'At a glance'}</th>
                  {tiers.map((tier) => (
                    <th key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>{tier.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pc-rowhead">{t.compare_price || 'Monthly'}</td>
                  {tiers.map((tier) => (
                    <td key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>
                      <bdi className="pc-price">{currency} {num(tier.pricing.monthly)}</bdi>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pc-rowhead">{t.compare_bottleneck || 'Bottleneck killed'}</td>
                  {tiers.map((tier) => <td key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>{tier.bottleneck}</td>)}
                </tr>
                <tr>
                  <td className="pc-rowhead">{t.compare_replaces || 'Replaces'}</td>
                  {tiers.map((tier) => <td key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>{tier.roiReplaces}</td>)}
                </tr>
                <tr>
                  <td className="pc-rowhead">{t.compare_payback || 'Payback'}</td>
                  {tiers.map((tier) => <td key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>{tier.payback}</td>)}
                </tr>
                <tr>
                  <td className="pc-rowhead">{t.compare_team || 'AI team'}</td>
                  {tiers.map((tier, i) => (
                    <td key={tier.key} className={tier.popular ? 'pc-col--popular' : ''}>
                      {teamCountLabel(teamCounts[i])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>


        {/* Guarantee */}
        <div className="pricing-guarantee" data-reveal>
          <span className="guarantee-badge" aria-hidden="true"><Icon name="shield" size={22} /></span>
          <div className="guarantee-body">
            <h4 className="guarantee-title">{t.guarantee_title || 'The 30-Day Leak Guarantee'}</h4>
            <p className="guarantee-desc">{t.guarantee_desc || 'If, in your first month on Catalyst, Layla doesn’t book the agreed number of qualified viewings, you don’t pay for month two. We put the target on a spreadsheet before we start — and measure it in arithmetic, not adjectives.'}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
