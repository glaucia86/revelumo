// Progressive enhancement only. No requests, persistence or analytics.
const slider = document.querySelector('#comparison-range');
const comparison = document.querySelector('.comparison');
if (slider && comparison) {
  const update = () => comparison.style.setProperty('--split', `${slider.value}%`);
  slider.addEventListener('input', update);
  update();
}
