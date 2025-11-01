tinymce.init({
  selector: 'textarea[textarea-mce]',
  license_key: 'gpl', // thêm dòng này (Community)
  height: 520,
  plugins: [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview', 'anchor',
    'searchreplace', 'visualblocks', 'visualchars', 'code', 'fullscreen',
    'insertdatetime', 'media', 'table', 'help', 'wordcount',
    'quickbars', 'autoresize', 'directionality', 'nonbreaking', 'pagebreak',
    'codesample', 'hr'
  ].join(' '),
  menubar: 'file edit view insert format tools table help',
  toolbar: [
    'undo redo | blocks fontfamily fontsize |',
    'bold italic underline strikethrough | forecolor backcolor |',
    'alignleft aligncenter alignright alignjustify | outdent indent | bullist numlist |',
    'link image media table | charmap codesample hr | pagebreak nonbreaking |',
    'ltr rtl | removeformat | fullscreen preview code | searchreplace'
  ].join(' '),
  toolbar_sticky: true,
  quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote | alignleft aligncenter alignright | bullist numlist | forecolor backcolor',
  quickbars_insert_toolbar: 'image media table hr | pagebreak codesample',
  contextmenu: 'link image table',
  autosave_interval: '30s',
  autosave_retention: '2m',
  insertdatetime_formats: ['%H:%M:%S', '%d/%m/%Y', '%d-%m-%Y %H:%M'],
  image_title: true,
  image_caption: true,
  content_style: 'body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; }'
});