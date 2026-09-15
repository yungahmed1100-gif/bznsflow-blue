import React from 'react';
import { Seo } from './Seo';
import { Icon } from './Icon';
import { getStrings } from '../../i18n';
import '../../styles/legal.css';

// Shared shell for the legal pages (privacy, terms, data deletion).
//
// A standalone page with its own small header, for the same reason SignIn.jsx
// has one: NavBar takes eleven props of scroll and menu state owned by Home,
// and all of its links are hash anchors that only resolve on the home page.
//
// `doc` is { title, updated, lead, sections }. A section may carry p, list,
// table (a key into `tables`), p2 and nested sub-sections.

/** One section, plus any nested sub-sections. Used for both levels. */
function Block({ node, tables, headHtml: Head = 'h2' }) {
  return (
    <>
      <Head className={Head === 'h2' ? 'legal-h2' : 'legal-h3'}>{node.h}</Head>

      {node.p?.map((text) => <p key={text}>{text}</p>)}

      {node.list && (
        <ul className="legal-list">
          {node.list.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}

      {node.table && <DataTable rows={tables[node.table]} head={tables[`${node.table}Head`]} />}

      {node.p2?.map((text) => <p key={text}>{text}</p>)}

      {node.sub?.map((child) => (
        <Block key={child.h} node={child} tables={tables} headHtml="h3" />
      ))}
    </>
  );
}

/**
 * Tables are the honest way to present "who else sees your data" — prose hides
 * how many parties there are. Wrapped so a narrow screen scrolls the table
 * rather than the whole page.
 */
function DataTable({ rows, head }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                i === 0
                  ? <th key={cell} scope="row"><bdi>{cell}</bdi></th>
                  : <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalPage({ lang = 'ar', path, doc, updatedIso, tables = {} }) {
  const t = getStrings(lang);
  const ar = lang === 'ar';

  return (
    <>
      <Seo
        lang={lang}
        path={path}
        title={`${doc.title} — BznsFlow`}
        description={doc.lead.slice(0, 155)}
      />

      <main className="legal-shell" id="main-content">
        <header className="legal-nav">
          <a className="legal-brand" href={ar ? '/' : '/en'}>
            <img src="/logo.png" alt="BznsFlow" width="36" height="36" />
            <span>BznsFlow</span>
          </a>
          <a className="legal-lang" href={ar ? `/en${path}` : path}>
            <Icon name="globe" size={15} />
            <span>{ar ? 'English' : 'العربية'}</span>
          </a>
        </header>

        <article className="legal-doc">
          <h1 className="legal-h1">{doc.title}</h1>
          {/* A machine-readable date next to the human one, so "is this
              current?" has an unambiguous answer. */}
          <p className="legal-updated">
            <time dateTime={updatedIso}>{doc.updated}</time>
          </p>
          <p className="legal-lead">{doc.lead}</p>

          {doc.sections.map((section) => (
            <Block key={section.h} node={section} tables={tables} />
          ))}

          <p className="legal-back">
            <a href={ar ? '/' : '/en'}>{t.auth_back}</a>
          </p>
        </article>
      </main>
    </>
  );
}
