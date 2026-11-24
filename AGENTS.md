# PlanAsistan geliştirme notları

## Arayüz kuralları

- **Görev kodu düğmesi:** Görev listelenen her ekranda görevin kodu (Jira anahtarı) `components/modern/TaskKeyButton.tsx` ile düğme olarak gösterilir; tıklanınca görev ayrıntısı açılır. Görev adı düz metin kalır. Jira anahtarı olmayan görevde düğme "Görev" yazar. Projede karşılığı olmayan bir Jira anahtarı (ör. başka projenin worklog'u) düğme değil, düz etiket olarak gösterilir.
