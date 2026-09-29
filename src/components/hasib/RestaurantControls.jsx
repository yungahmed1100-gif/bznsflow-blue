import React, { useMemo, useState } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { hasib } from '../../lib/dashboard/api';
import { Money } from './Badges';
import { Dialog } from '../dashboard/Dialog';
import { businessDate } from '../../../convex/hasib/period';

const REASONS = ['spoilage', 'prep_trim', 'overproduction', 'unsold', 'expired', 'failed_batch', 'damaged', 'remake', 'other'];


function Metric({ label, value, money = false }) {
  return <div className="hb-tile"><dt>{label}</dt><dd><span className="hb-tile-value">{value.value == null ? value.h.t('notEnoughRecords') : money ? <Money h={value.h} minor={value.value} /> : `${value.value / 100}%`}</span></dd></div>;
}

const label = (h, row) => h.name(row);

/** Food-service controls stay inside Stock and Money instead of adding tabs. */
export function RestaurantControls({ s, h, overview, timezone = 'Asia/Muscat', onChanged }) {
  const [notice, setNotice] = useState(''), [action, setAction] = useState(''), [busy, setBusy] = useState(false);
  const [requestIds] = useState(() => new Map());
  const today = () => businessDate(Date.now(), timezone);
  const [recipeForm, setRecipeForm] = useState({ menuVariantId: '', yieldQty: '1', modifiers: [], ingredients: [{ variantId: '', qty: '1', unit: 'piece' }] });
  const [wasteForm, setWasteForm] = useState({ variantId: '', qty: '1', reason: 'spoilage', note: '' });
  const [countForm, setCountForm] = useState({ variantId: '', countedQty: '0', note: '' });
  const [receiveForm, setReceiveForm] = useState({ variantId: '', qty: '1', unitCost: '', vendor: '', invoiceNumber: '', receivedOn: today(), useBy: '' });
  const [batchForm, setBatchForm] = useState({ outputVariantId: '', outputQty: '1', inputs: [{ variantId: '', qty: '1', unit: 'piece' }], note: '', producedOn: today(), useBy: '' });
  const items = usePolling(() => hasib('items', { limit: 100 }), [], { interval: 60000 });
  const summary = usePolling(() => hasib('restaurant_summary', { period: 'month' }), [], { interval: 60000 });
  const suggestions = usePolling(() => hasib('baking_suggestions'), [], { interval: 60000, enabled: overview.pack.id === 'cakes' });
  const recipes = usePolling(() => hasib('recipes', { limit: 100 }), [], { interval: 60000 });
  const expiry = usePolling(() => hasib('stock_expiry', { days: 7 }), [], { interval: 60000, enabled: overview.pack.modules.shelfLife === 'available' });
  const variants = useMemo(() => (items.data?.items || []).flatMap(item => item.variants.map(variant => ({ ...variant, item, nameAr: item.nameAr, nameEn: item.nameEn }))), [items.data]);
  const menu = variants.filter(v => !v.item.trackStock && !v.item.archived);
  const ingredients = variants.filter(v => v.item.trackStock && !v.item.archived && !v.item.serialized);
  const refresh = () => { expiry.refresh({ quiet: true }); onChanged?.(); summary.refresh({ quiet: true }); recipes.refresh({ quiet: true }); items.refresh({ quiet: true }); };
  const fail = e => setNotice(h.reason(e.reason) || s.reason(e.reason));
  const submit = async (operation, body, reset) => {
    if (busy) return;
    const payload = { ...body }; delete payload.requestId;
    const key = JSON.stringify([operation, payload]); if (!requestIds.has(key)) requestIds.set(key, crypto.randomUUID());
    try { setBusy(true); setNotice(''); await hasib(operation, { ...payload, requestId: requestIds.get(key) }); requestIds.delete(key); reset(); setAction(''); refresh(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const saveRecipe = e => {
    e.preventDefault();
    submit('recipe_save', { menuVariantId: recipeForm.menuVariantId, ...(recipes.data?.items?.find(r => r.menuVariantId === recipeForm.menuVariantId) ? { version: recipes.data.items.find(r => r.menuVariantId === recipeForm.menuVariantId).version } : {}), yieldQty: Number(recipeForm.yieldQty), modifiers: recipeForm.modifiers.map(m => ({ key: m.key, label: m.label, priceMinor: Math.round(Number(m.price) * 1000), ingredients: m.ingredients.map(i => ({ variantId: i.variantId, qty: Number(i.qty), unit: i.unit })) })), ingredients: recipeForm.ingredients.map(i => ({ variantId: i.variantId, qty: Number(i.qty), unit: i.unit })) },
      () => setRecipeForm({ menuVariantId: '', yieldQty: '1', modifiers: [], ingredients: [{ variantId: '', qty: '1', unit: 'piece' }] }));
  };
  const saveWaste = e => { e.preventDefault(); submit('waste_create', { requestId: crypto.randomUUID(), variantId: wasteForm.variantId, qty: Number(wasteForm.qty), reason: wasteForm.reason, note: wasteForm.note }, () => setWasteForm({ ...wasteForm, qty: '1', note: '' })); };
  const saveCount = e => { e.preventDefault(); submit('stock_count', { requestId: crypto.randomUUID(), variantId: countForm.variantId, countedQty: Number(countForm.countedQty), note: countForm.note }, () => setCountForm({ ...countForm, countedQty: '0', note: '' })); };
  const receive = e => { e.preventDefault(); submit('stock_receive', { requestId: crypto.randomUUID(), vendor: receiveForm.vendor, invoiceNumber: receiveForm.invoiceNumber, receivedOn: receiveForm.receivedOn,
    lines: [{ variantId: receiveForm.variantId, qty: Number(receiveForm.qty), unitCostMinor: Math.round(Number(receiveForm.unitCost) * 1000), ...(receiveForm.useBy ? { useBy: receiveForm.useBy } : {}) }] }, () => setReceiveForm({ ...receiveForm, qty: '1', unitCost: '', invoiceNumber: '', useBy: '' })); };
  const saveBatch = e => { e.preventDefault(); submit('batch_create', { requestId: crypto.randomUUID(), outputVariantId: batchForm.outputVariantId, outputQty: Number(batchForm.outputQty),
    inputs: batchForm.inputs.map(i => ({ variantId: i.variantId, qty: Number(i.qty), unit: i.unit })), note: batchForm.note, ...(batchForm.producedOn ? { producedOn: batchForm.producedOn } : {}), ...(batchForm.useBy ? { useBy: batchForm.useBy } : {}) },
    () => setBatchForm({ ...batchForm, outputQty: '1', inputs: [{ variantId: '', qty: '1', unit: 'piece' }], note: '', useBy: '' })); };
  const setIngredient = (index, patch) => setRecipeForm(f => ({ ...f, ingredients: f.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const r = summary.data;
  const cafe = overview.pack.id === 'cafe', bakery = overview.pack.id === 'cakes';
  const controlsTitle = bakery ? 'bakeryControls' : cafe ? 'cafeControls' : 'restaurantControls';
  const recipeName = row => s.ar ? row.menuNameAr || row.menuNameEn : row.menuNameEn || row.menuNameAr;

  return (
    <section className="hb-restaurant-controls" aria-labelledby="hb-food-service-title">
      <div className="hb-panel-head"><h2 id="hb-food-service-title" className="hb-panel-title">{h.t(controlsTitle)}</h2><span className="ld-help">{h.t('period_month')}</span></div>
      {r && <details><summary>{h.t('details')}</summary><dl className="hb-tiles">
        <Metric label={h.t(cafe ? 'productCost' : 'foodCost')} value={{ value: r.foodCostBps, h }} />
        <Metric label={h.t('laborCost')} value={{ value: r.laborCostBps, h }} />
        <Metric label={h.t('primeCost')} value={{ value: r.primeCostBps, h }} />
        <Metric label={h.t('wasteCost')} value={{ value: r.wasteMinor, h }} money />
        <Metric label={h.t('stockVariance')} value={{ value: r.stockVarianceMinor, h }} money />
        <Metric label={h.t('actualUsage')} value={{ value: r.usageVarianceMinor, h }} money />
      </dl></details>}
      {r?.actualUsageMinor == null && <p className="ld-help">{h.t('missingCounts')}</p>}
      {notice && <p className="ld-inline-error" role="alert">{notice}</p>}
      <div className="ld-actions">{['saveRecipe', 'recordWaste', 'receiveStock', 'countStock', ...(overview.pack.modules.batches === 'available' ? ['productionBatch'] : [])].map(key => <button type="button" className="ld-button" key={key} onClick={() => setAction(key)}>{h.t(key)}</button>)}</div>
      {action && <Dialog s={s} title={h.t(action)} onClose={() => setAction('')}>
      {notice && <p role="alert" className="ld-inline-error">{notice}</p>}
      <fieldset disabled={busy} className="hb-action-fields">
        {action === 'saveRecipe' && <form className="hb-panel hb-restaurant-form" onSubmit={saveRecipe}>
          <h3 className="hb-panel-title">{h.t('saveRecipe')}</h3>
          <label className="ld-field">{h.t('menuItem')}<select value={recipeForm.menuVariantId} onChange={e => { const saved = recipes.data?.items?.find(r => r.menuVariantId === e.target.value); setRecipeForm(saved ? { menuVariantId: e.target.value, yieldQty: String(saved.yieldQty), ingredients: saved.ingredients.map(i => ({ ...i, qty: String(i.qty) })), modifiers: (saved.modifiers || []).map(m => ({ ...m, price: String(m.priceMinor / 1000) })) } : { menuVariantId: e.target.value, yieldQty: '1', ingredients: [{ variantId: '', qty: '1', unit: 'piece' }], modifiers: [] }); }}><option value="">—</option>{menu.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}{v.options.length ? ` — ${v.options.map(o => o.value).join(' / ')}` : ''}</option>)}</select></label>
          <label className="ld-field">{h.t('yieldQty')}<input className="hb-qty" type="number" min="1" step="1" value={recipeForm.yieldQty} onChange={e => setRecipeForm({ ...recipeForm, yieldQty: e.target.value })} /></label>
          {recipeForm.ingredients.map((ingredient, index) => <div className="hb-restaurant-row" key={index}>
            <label className="ld-field">{h.t('ingredient')}<select value={ingredient.variantId} onChange={e => { const v = ingredients.find(x => x.id === e.target.value); setIngredient(index, { variantId: e.target.value, unit: v?.item.unit || ingredient.unit }); }}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
            <label className="ld-field">{h.t('quantity')}<input className="hb-qty" type="number" min="0.001" step="any" value={ingredient.qty} onChange={e => setIngredient(index, { qty: e.target.value })} /></label>
            <label className="ld-field">{h.t('unit')}<input value={ingredient.unit} maxLength="20" onChange={e => setIngredient(index, { unit: e.target.value })} /></label>
            {recipeForm.ingredients.length > 1 && <button type="button" className="ld-button ld-quiet ld-compact" onClick={() => setRecipeForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== index) }))}>{h.t('removeIngredient')}</button>}
          </div>)}
          {cafe && <details><summary>{h.ar ? 'الحليب والإضافات' : 'Milk swaps and extras'}</summary><p className="ld-help">{h.ar ? 'استخدم كمية سالبة لإزالة الحليب الأساسي وكمية موجبة لإضافة البديل.' : 'Use a negative quantity to remove base milk and a positive quantity to add its replacement.'}</p>
            {recipeForm.modifiers.map((modifier, index) => <fieldset className="ld-fieldset" key={index}><legend>{h.ar ? 'إضافة' : 'Modifier'} {index + 1}</legend>
              {[['key', 'Short code', 'رمز قصير'], ['label', 'Label', 'الاسم'], ['price', 'Price change (OMR)', 'تغيير السعر (ر.ع.)']].map(([key, en, ar]) => <label key={key} className="ld-field">{h.ar ? ar : en}<input required value={modifier[key]} onChange={e => setRecipeForm(f => ({ ...f, modifiers: f.modifiers.map((m, i) => i === index ? { ...m, [key]: e.target.value } : m) }))} /></label>)}
              {modifier.ingredients.map((ingredient, ingredientIndex) => <div className="hb-restaurant-row" key={ingredientIndex}>
                <label className="ld-field">{h.t('ingredient')}<select required value={ingredient.variantId} onChange={e => { const variant = ingredients.find(v => v.id === e.target.value); setRecipeForm(f => ({ ...f, modifiers: f.modifiers.map((m, i) => i === index ? { ...m, ingredients: m.ingredients.map((v, j) => j === ingredientIndex ? { ...v, variantId: e.target.value, unit: variant?.item.unit || 'piece' } : v) } : m) })); }}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
                <label className="ld-field">{h.t('quantity')}<input required type="number" step="any" value={ingredient.qty} onChange={e => setRecipeForm(f => ({ ...f, modifiers: f.modifiers.map((m, i) => i === index ? { ...m, ingredients: m.ingredients.map((v, j) => j === ingredientIndex ? { ...v, qty: e.target.value } : v) } : m) }))} /></label>
              </div>)}
              <button type="button" className="ld-button" onClick={() => setRecipeForm(f => ({ ...f, modifiers: f.modifiers.map((m, i) => i === index ? { ...m, ingredients: [...m.ingredients, { variantId: '', qty: '1', unit: 'piece' }] } : m) }))}>{h.t('addIngredient')}</button>
              <button type="button" className="ld-button" onClick={() => setRecipeForm(f => ({ ...f, modifiers: f.modifiers.filter((_, i) => i !== index) }))}>{h.t('remove')}</button>
            </fieldset>)}
            <button type="button" className="ld-button" onClick={() => setRecipeForm(f => ({ ...f, modifiers: [...f.modifiers, { key: '', label: '', price: '0', ingredients: [{ variantId: '', qty: '1', unit: 'piece' }] }] }))}>{h.ar ? 'إضافة خيار' : 'Add option'}</button>
          </details>}
          <div className="ld-actions"><button type="button" className="ld-button ld-quiet" onClick={() => setRecipeForm(f => ({ ...f, ingredients: [...f.ingredients, { variantId: '', qty: '1', unit: 'piece' }] }))}>{h.t('addIngredient')}</button><button className="ld-button ld-primary" disabled={!recipeForm.menuVariantId}>{h.t('save')}</button></div>
        </form>}
        {action === 'recordWaste' && <form className="hb-panel hb-restaurant-form" onSubmit={saveWaste}>
          <h3 className="hb-panel-title">{h.t('recordWaste')}</h3>
          <label className="ld-field">{h.t('ingredient')}<select value={wasteForm.variantId} onChange={e => setWasteForm({ ...wasteForm, variantId: e.target.value })}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
          <label className="ld-field">{h.t('quantity')}<input className="hb-qty" type="number" min="0.001" step="any" value={wasteForm.qty} onChange={e => setWasteForm({ ...wasteForm, qty: e.target.value })} /></label>
          <label className="ld-field">{h.t('wasteReason')}<select value={wasteForm.reason} onChange={e => setWasteForm({ ...wasteForm, reason: e.target.value })}>{REASONS.map(reason => <option key={reason} value={reason}>{h.t(`waste_${reason}`)}</option>)}</select></label>
          <label className="ld-field">{h.t('notes')}<input value={wasteForm.note} onChange={e => setWasteForm({ ...wasteForm, note: e.target.value })} /></label>
          <button className="ld-button ld-primary" disabled={!wasteForm.variantId}>{h.t('recordWaste')}</button>
        </form>}
        {action === 'receiveStock' && <form className="hb-panel hb-restaurant-form" onSubmit={receive}>
          <h3 className="hb-panel-title">{h.t('receiveStock')}</h3>
          <label className="ld-field">{h.t('ingredient')}<select value={receiveForm.variantId} onChange={e => setReceiveForm({ ...receiveForm, variantId: e.target.value })}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
          <label className="ld-field">{h.t('quantity')}<input className="hb-qty" type="number" min="0.001" step="any" value={receiveForm.qty} onChange={e => setReceiveForm({ ...receiveForm, qty: e.target.value })} /></label>
          <label className="ld-field">{h.t('unitCost')}<input className="hb-money" inputMode="decimal" value={receiveForm.unitCost} onChange={e => setReceiveForm({ ...receiveForm, unitCost: e.target.value })} /></label>
          <label className="ld-field">{h.t('receivedFrom')}<input value={receiveForm.vendor} onChange={e => setReceiveForm({ ...receiveForm, vendor: e.target.value })} /></label>
          <label className="ld-field">{h.t('invoiceNumber')}<input value={receiveForm.invoiceNumber} onChange={e => setReceiveForm({ ...receiveForm, invoiceNumber: e.target.value })} /></label>
          <label className="ld-field">{h.t('receivedOn')}<input type="date" value={receiveForm.receivedOn} onChange={e => setReceiveForm({ ...receiveForm, receivedOn: e.target.value })} /></label>
          {overview.pack.modules.shelfLife === 'available' && <label className="ld-field">{h.t('useBy')}<input type="date" value={receiveForm.useBy} onChange={e => setReceiveForm({ ...receiveForm, useBy: e.target.value })} /></label>}
          <button className="ld-button ld-primary" disabled={!receiveForm.variantId || !receiveForm.unitCost || !receiveForm.vendor}>{h.t('receiveStock')}</button>
        </form>}
        {action === 'countStock' && <form className="hb-panel hb-restaurant-form" onSubmit={saveCount}>
          <h3 className="hb-panel-title">{h.t('countStock')}</h3>
          <label className="ld-field">{h.t('ingredient')}<select value={countForm.variantId} onChange={e => setCountForm({ ...countForm, variantId: e.target.value })}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)} · {v.onHand}</option>)}</select></label>
          <label className="ld-field">{h.t('countedQty')}<input className="hb-qty" type="number" min="0" step="any" value={countForm.countedQty} onChange={e => setCountForm({ ...countForm, countedQty: e.target.value })} /></label>
          <label className="ld-field">{h.t('notes')}<input value={countForm.note} onChange={e => setCountForm({ ...countForm, note: e.target.value })} /></label>
          <button className="ld-button ld-primary" disabled={!countForm.variantId}>{h.t('recordCount')}</button>
        </form>}
        {action === 'productionBatch' && <form className="hb-panel hb-restaurant-form" onSubmit={saveBatch}>
          <h3 className="hb-panel-title">{h.t('productionBatch')}</h3>
          <label className="ld-field">{h.t('productionOutput')}<select value={batchForm.outputVariantId} onChange={e => setBatchForm({ ...batchForm, outputVariantId: e.target.value })}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
          <label className="ld-field">{h.t('quantity')}<input className="hb-qty" type="number" min="1" step="1" value={batchForm.outputQty} onChange={e => setBatchForm({ ...batchForm, outputQty: e.target.value })} /></label>
          {batchForm.inputs.map((input, index) => <div className="hb-restaurant-row" key={index}>
            <label className="ld-field">{h.t('ingredient')}<select required value={input.variantId} onChange={e => { const variant = ingredients.find(v => v.id === e.target.value); setBatchForm(f => ({ ...f, inputs: f.inputs.map((v, i) => i === index ? { ...v, variantId: e.target.value, unit: variant?.item.unit || 'piece' } : v) })); }}><option value="">—</option>{ingredients.map(v => <option key={v.id} value={v.id}>{label(h, v.item)}</option>)}</select></label>
            <label className="ld-field">{h.t('quantity')}<input required type="number" min="0.001" step="any" value={input.qty} onChange={e => setBatchForm(f => ({ ...f, inputs: f.inputs.map((v, i) => i === index ? { ...v, qty: e.target.value } : v) }))} /></label>
            <label className="ld-field">{h.t('unit')}<input required value={input.unit} onChange={e => setBatchForm(f => ({ ...f, inputs: f.inputs.map((v, i) => i === index ? { ...v, unit: e.target.value } : v) }))} /></label>
            {batchForm.inputs.length > 1 && <button type="button" className="ld-button" onClick={() => setBatchForm(f => ({ ...f, inputs: f.inputs.filter((_, i) => i !== index) }))}>{h.t('removeIngredient')}</button>}
          </div>)}
          <button type="button" className="ld-button" onClick={() => setBatchForm(f => ({ ...f, inputs: [...f.inputs, { variantId: '', qty: '1', unit: 'piece' }] }))}>{h.t('addIngredient')}</button>
          <label className="ld-field">{h.t('producedOn')}<input type="date" value={batchForm.producedOn} onChange={e => setBatchForm({ ...batchForm, producedOn: e.target.value })} /></label>
          {bakery && <label className="ld-field">{h.t('useBy')}<input type="date" value={batchForm.useBy} onChange={e => setBatchForm({ ...batchForm, useBy: e.target.value })} /></label>}
          <label className="ld-field">{h.t('notes')}<input value={batchForm.note} onChange={e => setBatchForm({ ...batchForm, note: e.target.value })} /></label>
          <button className="ld-button ld-primary" disabled={!batchForm.outputVariantId || batchForm.inputs.some(i => !i.variantId)}>{h.t('save')}</button>
        </form>}
      </fieldset></Dialog>}
      {overview.pack.modules.shelfLife === 'available' && <section className="hb-panel">
        <div className="hb-panel-head"><h3 className="hb-panel-title">{h.t('shelfLife')}</h3><span className="ld-help">{h.t('expiringStock')}: {expiry.data?.expiring || 0} · {h.t('expiredStock')}: {expiry.data?.expired || 0}</span></div>
        {!expiry.data?.items?.length ? <p className="ld-help">{h.t('noExpiringStock')}</p> : <div className="ld-table-wrap"><table className="ld-table"><thead><tr><th>{h.t('products')}</th><th>{h.t('quantity')}</th><th>{h.t('useBy')}</th><th>{h.t('status')}</th></tr></thead><tbody>{expiry.data.items.map(row => <tr key={row.lotId}><th scope="row"><bdi>{s.ar ? row.nameAr || row.nameEn : row.nameEn || row.nameAr}</bdi></th><td className="ld-num">{row.remainingQty}</td><td>{row.useBy}</td><td>{h.t(row.status === 'expired' ? 'expiredStock' : 'expiringStock')}</td></tr>)}</tbody></table></div>}
      </section>}
      {bakery && <details className="hb-report-details"><summary>{h.ar ? 'اقتراحات الخَبز' : 'Baking suggestions'}</summary><p className="ld-help">{h.ar ? 'اقتراحات من آخر أربعة أيام مماثلة، بعد خصم المخزون القابل للبيع وإضافة الطلبات المسبقة. لا تُنشئ إنتاجاً تلقائياً.' : 'Suggestions from the last four matching weekdays, less sellable stock, plus known preorders. Review before recording production.'}</p>{suggestions.error && <p role="alert">{h.reason(suggestions.error.reason) || s.reason(suggestions.error.reason)}</p>}{suggestions.data?.items?.map(row => <p key={row.variantId}>{h.name(variants.find(v => v.id === row.variantId)?.item || {})} · {row.suggestedQty == null ? h.t('notEnoughRecords') : row.suggestedQty}</p>)}</details>}
      <section className="hb-panel">
        <h3 className="hb-panel-title">{h.t('recipes')}</h3>
        {!recipes.data?.items?.length ? <p className="ld-help">{h.t('noRecipes')}</p> : <div className="ld-table-wrap"><table className="ld-table"><thead><tr><th>{h.t('menuItem')}</th><th>{h.t('yieldQty')}</th><th>{h.t('cost')}</th><th>{h.t('ingredients')}</th></tr></thead><tbody>{recipes.data.items.map(recipe => <tr key={recipe.id}><th scope="row"><bdi>{recipeName(recipe)}</bdi></th><td className="ld-num">{recipe.yieldQty}</td><td><Money h={h} minor={recipe.costMinor} /></td><td>{recipe.ingredients.map(i => `${s.ar ? i.nameAr || i.nameEn : i.nameEn || i.nameAr} × ${i.qty} ${i.unit}`).join(', ')}</td></tr>)}</tbody></table></div>}
      </section>
    </section>
  );
}
