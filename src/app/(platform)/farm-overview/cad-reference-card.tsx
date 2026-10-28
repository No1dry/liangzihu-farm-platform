'use client';

import styles from './farm-overview.module.css';

export type CadCategory = 'land' | 'road' | 'canal';

export type CadFeatureProperties = {
  category: CadCategory;
  category_label: string;
  cad_file: string;
  layer_name: string;
  handle: string;
  source_class: string;
  confidence: string;
  measure_type: 'area' | 'length';
  measure_value: number;
  measure_unit: string;
  source_notice: string;
};

export type CadFeature = {
  id: string;
  properties: CadFeatureProperties;
};

const categoryNames: Record<CadCategory, string> = {
  land: '土地平整范围',
  road: '生产道路',
  canal: '农渠与排水沟',
};

export default function CadReferenceCard({
  feature,
  onClose,
}: {
  feature: CadFeature;
  onClose: () => void;
}) {
  const p = feature.properties;
  const measureLabel = p.measure_type === 'area' ? '面积' : '长度';
  return (
    <aside className={styles.drawer} aria-label="竣工图参考详情">
      <div className={styles.drawerTop}>
        <div className={styles.detailHeading}>
          <span className={styles.detailKindIcon} aria-hidden="true">
            <svg width="21" height="21" viewBox="0 0 21 21" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3.5 10.5l7-7 7 7" />
              <path d="M5.5 9.5v7h10v-7" />
            </svg>
          </span>
          <h2>{categoryNames[p.category]}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭竣工图参考详情" title="收起右侧详情栏">
          ×
        </button>
      </div>
      <div className={styles.detailBadges}>
        <span className={styles.kind}>真实 CAD 参考</span>
        <span className={styles.statusBadge}>非正式农业资产</span>
      </div>
      <p className={styles.detailContext}>{p.source_notice}</p>
      <div className={styles.detailTabBody}>
        <dl className={styles.detailList}>
          <div>
            <dt>类别</dt>
            <dd>{p.category_label}</dd>
          </div>
          <div>
            <dt>所属竣工图</dt>
            <dd>{p.cad_file}</dd>
          </div>
          <div>
            <dt>原始图层</dt>
            <dd>{p.layer_name}</dd>
          </div>
          <div>
            <dt>Handle</dt>
            <dd>{p.handle}</dd>
          </div>
          <div>
            <dt>来源类</dt>
            <dd>{p.source_class}</dd>
          </div>
          <div>
            <dt>{measureLabel}</dt>
            <dd>
              {p.measure_value.toLocaleString('zh-CN')} {p.measure_unit}
            </dd>
          </div>
          <div>
            <dt>可信度</dt>
            <dd>{p.confidence}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.drawerActions}>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  );
}
