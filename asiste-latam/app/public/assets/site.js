// Calculadora de pérdidas por inasistencias (sitio público).
(() => {
  const box = document.querySelector('.calc');
  if (!box) return;
  const cur = box.dataset.currency, loc = box.dataset.locale || 'es-PE';
  const fmt = new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 0 });
  const $ = (id) => document.getElementById(id);
  function update() {
    const citas = +$('citas').value, ticket = +$('ticket').value, ns = +$('ns').value / 100;
    const lost = citas * 4.33 * ns * ticket;
    $('o-citas').textContent = citas;
    $('o-ticket').textContent = fmt.format(ticket);
    $('o-ns').textContent = Math.round(ns * 100) + ' %';
    $('lost').textContent = fmt.format(lost);
    $('won').textContent = fmt.format(lost * 0.5);
  }
  ['citas', 'ticket', 'ns'].forEach((id) => $(id).addEventListener('input', update));
  update();
})();
