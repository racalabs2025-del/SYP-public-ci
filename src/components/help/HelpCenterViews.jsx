import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  QuestionMarkCircleIcon,
  BookOpenIcon,
  ChevronDownIcon,
  MapPinIcon,
  UsersIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
  SparklesIcon,
  ArrowRightIcon,
  DocumentArrowUpIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import './HelpCenterViews.css';

const FAQ_ITEMS = [
  {
    q: 'Saha Yönetim Paneli (SYP) nedir ve temel amacı nedir?',
    a: 'SYP, İstanbul genelindeki saha görev planlarını, teyit edilmiş faaliyetleri ve takip edilen işleri merkezden gösterir. Görev planı canlı konum bilgisi değildir.',
    category: 'Genel',
  },
  {
    q: 'Harita üzerinde ilçe ve mahalle detaylarına nasıl ulaşabilirim?',
    a: 'İstanbul 2.5D ve 3D haritaları üzerinde doğrudan herhangi bir ilçeye tıklayarak ilçe komuta odasına geçebilirsiniz. Ayrıca sol menüdeki "İlçeler" sekmesini açarak arama yapabilir, istediğiniz ilçeyi seçtiğinizde altındaki mahalle listesine doğrudan ulaşabilirsiniz.',
    category: 'Harita & Navigasyon',
  },
  {
    q: 'Harita katmanları (Planlanan Personel, Görevler, Takip İşleri) nasıl kullanılır?',
    a: 'Haritadaki KATMAN butonundan planlı personel, gerçekleşen çalışmalar, takip edilen işler ve meydan katmanlarını seçebilirsiniz. Mobil görünümde harita yerine liste kullanılır.',
    category: 'Harita & Navigasyon',
  },
  {
    q: 'Yeni bir görev veya takip edilen iş nasıl kaydedilir?',
    a: 'Yetkili veri giriş personeli görev planını ilgili birim ve personel için kaydeder. Takip edilen iş için başlık ve sorumlu gerekir; tamamlanırken kapanış notu girilir.',
    category: 'Operasyon',
  },
  {
    q: 'Veri yükleme işlemi nasıl yapılır ve kimler yükleme yapabilir?',
    a: 'Birimlerden gelen verileri merkez ekip teyit eder. Admin ve Veri Giriş Personeli, Veri Yükleme ekranından birime uygun Excel şablonlarıyla kayıt yükleyebilir.',
    category: 'Veri & Güvenlik',
  },
  {
    q: 'Saha Asistanı (Yapay Zeka) hangi konularda yardımcı olur?',
    a: 'Saha Asistanı seçili dönemin görev, çalışma ve takip işi kayıtlarını arar; her sonuç ilgili kayda açılır. Gelen metinden taslak oluşturur, kaydetmeden önce personel incelemesi gerekir.',
    category: 'Asistan & Analiz',
  },
  {
    q: 'Koyu tema (Dark Mode) ve Açık tema arasında nasıl geçiş yapabilirim?',
    a: 'Sol menünün alt kısmında yer alan güneş / ay ikonlu butona tıklayarak açık ve koyu tema arasında anında geçiş yapabilirsiniz. Seçiminiz tarayıcınızda hatırlanır.',
    category: 'Genel',
  },
];

const GUIDE_SECTIONS = [
  {
    step: 1,
    title: 'Şehir Takip & Genel Bakış',
    icon: BuildingOffice2Icon,
    summary: 'İstanbul genelindeki tüm saha gücünü, aktif birimleri ve kritik bildirimleri tek ekranda izleyin.',
    points: [
      'Üst bilgi çubuğundan tarih aralığı (Bugün, Bu Hafta, Özel Tarih) ve birim filtresi seçin.',
      'KPI kartları üzerinden tekil personel sayısını, gerçekleşen çalışmaları ve bekleyen işleri takip edin.',
      '3B / 2.5B harita butonları ile görünüm modunu değiştirin.',
    ],
    route: '/ilce-operasyonlari',
    actionText: 'Şehir Takip Ekranına Git',
  },
  {
    step: 2,
    title: 'İlçeler & Mahalleler Drill-Down',
    icon: MapPinIcon,
    summary: 'Şehir genelinden ilçe ve mahalle düzeyine kademeli geçişle yerel durumu derinlemesine inceleyin.',
    points: [
      'Harita üzerinden ilçeye tıklayın veya sol menüdeki "İlçeler" sekmesinden arama yapın.',
      'İlçe sayfasında o ilçeye özel görevli personelleri, meydanları ve yerel takip işlerini görün.',
      'Mahalle düzeyine inerek nokta bazlı saha çalışmalarını inceleyin.',
    ],
    route: '/ilce-operasyonlari',
    actionText: 'İlçeler Sekmesini Kullan',
  },
  {
    step: 3,
    title: 'Operasyonel Birimler Yönetimi',
    icon: ShieldCheckIcon,
    summary: 'Dört saha şefliğinin görevlerini ve personelini kendi birim ekranlarında izleyin.',
    points: [
      'Meydan Yönetim Şefliği: İstanbul’un meydanlarındaki planlı saha görevleri.',
      'Yerinde Çözüm Şefliği: Sahada görev yapan ekiplerin planları ve çalışmaları.',
      'Mobil Çözüm Noktaları Şefliği: Kampüste Çözüm, Mahallede Çözüm ve Kamuoyu Araştırmaları birimlerinin planları, personeli ve faaliyet geçmişi.',
      'Çözüm Noktaları ve Şubeleri Şefliği: İlçe ve mahallelere bağlı noktalar, personel ve vardiya planları. 153 başvuru kayıtları bu panelde tutulmaz.',
    ],
    route: '/meydan-yonetimi',
    actionText: 'Meydan Yönetimine Git',
  },
  {
    step: 4,
    title: 'Personel ve Görev Planlama',
    icon: UsersIcon,
    summary: 'Saha çalışanlarının görev çizelgelerini, iletişim bilgilerini ve çalışma alanlarını düzenleyin.',
    points: [
      'Personel kayıtları her birimin kendi sayfasında tutulur.',
      'Personel detayında görev geçmişi ve planın son güncelleme zamanını görüntüleyin. Telefonu yalnız Admin ve Yönetici görür.',
      'Yeni görev ekleyerek çalışanın görev yerini ve vardiya saatlerini belirleyin.',
    ],
    route: '/birim/MEYDAN/personel',
    actionText: 'Birim Personeline Git',
  },
  {
    step: 5,
    title: 'Takip Edilen İşler',
    icon: AdjustmentsHorizontalIcon,
    summary: 'Yönetimce izlenen işleri tek listede takip edin.',
    points: [
      'Başlık ve sorumlu girerek iş açın; ihtiyaç duyulan diğer alanları sonradan doldurun.',
      'Durum güncellemesi yapın; işi tamamlarken kapanış notu yazın.',
    ],
    route: '/takip-edilen-isler',
    actionText: 'Takip İşlerine Git',
  },
  {
    step: 6,
    title: 'Saha Asistanı (Karar Destek)',
    icon: SparklesIcon,
    summary: 'Saha kayıtlarında soru arayın ve gelen metinden gözden geçirilebilir taslak oluşturun.',
    points: [
      'Arama kutusuna "Bugün Üsküdar\'da hangi ekipler sahada?" gibi serbest metin girin.',
      'Yanıtın dayandığı kayda bağlantıdan ulaşın.',
      'Gelen metinden oluşturulan taslağı kaydetmeden önce doğrulayın.',
    ],
    route: '/asistan',
    actionText: 'Saha Asistanını Aç',
  },
  {
    step: 7,
    title: 'Ayarlar ve Veri Yönetimi (Admin)',
    icon: DocumentArrowUpIcon,
    summary: 'Sistem tercihlerini yönetin, rol atamalarını kontrol edin ve Excel şablonlarıyla veri aktarın.',
    points: [
      'Sol menü altındaki Ayarlar butonundan yönetim ekranına geçin (Yalnızca Admin).',
      'Standart Excel şablonlarını indirerek toplu personel ve görev verisi yükleyin.',
      'Yükleme öncesi doğrulama kontrolü ile hatalı kayıtların sisteme girmesini engelleyin.',
    ],
    route: '/ayarlar',
    actionText: 'Ayarlar Ekranına Git',
  },
];

export function FAQView() {
  const [openIdx, setOpenIdx] = useState(0);
  const [search, setSearch] = useState('');

  const filtered = search
    ? FAQ_ITEMS.filter((item) =>
        item.q.toLowerCase().includes(search.toLowerCase()) ||
        item.a.toLowerCase().includes(search.toLowerCase()) ||
        item.category.toLowerCase().includes(search.toLowerCase())
      )
    : FAQ_ITEMS;

  return (
    <div className="syp-help-view">
      <div className="syp-help-hero">
        <div className="syp-help-hero-badge">
          <QuestionMarkCircleIcon className="syp-help-hero-icon" />
          <span>Destek & Bilgi Merkezi</span>
        </div>
        <h2>Sık Sorulan Sorular</h2>
        <p>Saha Yönetim Paneli hakkında en çok merak edilen konular ve pratik kullanım ipuçları.</p>
        <div className="syp-help-search-box">
          <input
            type="search"
            placeholder="Sorularda veya konularda ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="syp-help-search-input"
            aria-label="Soru ara"
          />
        </div>
      </div>

      <div className="syp-faq-list">
        {filtered.map((item, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div key={idx} className={`syp-faq-card ${isOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="syp-faq-question-btn"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                aria-expanded={isOpen}
              >
                <div className="syp-faq-q-left">
                  <span className="syp-faq-category">{item.category}</span>
                  <span className="syp-faq-q-text">{item.q}</span>
                </div>
                <ChevronDownIcon className={`syp-faq-chevron ${isOpen ? 'is-open' : ''}`} />
              </button>
              {isOpen && (
                <div className="syp-faq-answer">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="syp-help-empty">
            <p>Aramanızla eşleşen soru bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function GuideView() {
  const navigate = useNavigate();

  return (
    <div className="syp-help-view">
      <div className="syp-help-hero">
        <div className="syp-help-hero-badge">
          <BookOpenIcon className="syp-help-hero-icon" />
          <span>Kullanım Rehberi</span>
        </div>
        <h2>Panel Nasıl Kullanılır?</h2>
        <p>Saha Yönetim Paneli modüllerini ve operasyonel iş akışlarını adım adım keşfedin.</p>
      </div>

      <div className="syp-guide-grid">
        {GUIDE_SECTIONS.map((sec) => {
          const Icon = sec.icon;
          return (
            <div key={sec.step} className="syp-guide-card">
              <div className="syp-guide-card-header">
                <span className="syp-guide-step-num">0{sec.step}</span>
                <div className="syp-guide-icon-wrap">
                  <Icon className="syp-guide-card-icon" />
                </div>
              </div>
              <h3 className="syp-guide-card-title">{sec.title}</h3>
              <p className="syp-guide-card-summary">{sec.summary}</p>
              <ul className="syp-guide-points">
                {sec.points.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
              <div className="syp-guide-card-action">
                <button
                  type="button"
                  className="syp-guide-nav-btn"
                  onClick={() => navigate(sec.route)}
                >
                  <span>{sec.actionText}</span>
                  <ArrowRightIcon className="syp-guide-btn-icon" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
