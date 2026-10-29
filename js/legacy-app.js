// =======================================================
// ===== GESTOR GLOBAL DE TEMA (DARK / LIGHT) ============
// =======================================================
function toggleTheme() {
    const body = document.body;
    const btn = document.getElementById('theme-toggle-btn');
    const icon = btn ? btn.querySelector('i') : null;

    body.classList.toggle('light-mode');
    body.classList.remove('dark-mode');

    const isLight = body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');

    if (icon) {
        if (isLight) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        } else {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }
    }
}
window.toggleTheme = toggleTheme;

(function () {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
    }
    document.body.classList.remove('dark-mode');
})();

document.addEventListener("DOMContentLoaded", function () {
        // Desactivar alertas emergentes de DataTables y configurar debounce global de búsqueda (350ms)
        if (window.jQuery && $.fn.dataTable) {
            $.fn.dataTable.ext.errMode = 'none';
            $.extend(true, $.fn.dataTable.defaults, { searchDelay: 350 });
        }

        // ---- VARIABLES GLOBALES ----
        let currentUser = null; window.currentUser = null;
        let html5QrCode = null;
        let activeScanType = null;
        let masterQRId = null;
        let currentDetailedUserId = null;
        let cachedAdminData = null;
        let cachedCoordinatorData = null;
        let cachedUserData = null;

        let userTable = null;
        let adminTable = null;
        let usersManagTable = null;
        let dutiesTable = null;
        let hoursReportTable = null;
        let detailedReportTable = null;
        let adminPermissionsTable = null;
        let userPermissionsTable = null;
        let substitutionsTable = null;
        let crossTable = null;
        let adminManualRequestsTable = null;
        let coordManualRequestsTable = null;

        // ---- FUNCIÓN LIMPIADORA DE URLs DE GOOGLE DRIVE ----
        // Transforma enlaces viejos problemáticos en enlaces seguros de Thumbnail
        function getSafeDriveImageUrl(url) {
            if (!url) return '';
            let safeUrl = String(url);
            if (safeUrl.includes('drive.google.com/uc') || safeUrl.includes('export=')) {
                const match = safeUrl.match(/id=([^&]+)/);
                if (match && match[1]) {
                    return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w500';
                }
            }
            return safeUrl;
        }

        // ---- VISOR DE IMÁGENES AL HACER CLIC ----
        $(document).on('click', '.clickable-photo, #foto-preview', function () {
            const src = $(this).attr('src');
            if (src && src.trim() !== '') {
                $('#enlarged-image').attr('src', src);
                $('#imageViewerModal').modal('show');
            }
        });

        // ---- FILTRO DATATABLES (CLIENT SIDE) ----
        $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
            if (settings.nTable.id !== 'adminAttendanceTable') return true;
            const minStr = $('#filter-start-date').val();
            const maxStr = $('#filter-end-date').val();
            if (minStr === "" && maxStr === "") return true;
            const dateStr = data[0].substring(0, 10);
            return (minStr === "" && dateStr <= maxStr) ||
                (minStr <= dateStr && maxStr === "") ||
                (minStr <= dateStr && dateStr <= maxStr);
        });

        // ===============================================
        // =========== VISTA DE ADMINISTRADOR ============
        // ===============================================
        function loadAdminDashboard() {
            loadView('AdminDashboard.html', function () {
                $('#user-name-display').text(currentUser.name);
                $('#logout-button').on('click', logout);

                if (currentUser.foto && currentUser.foto !== "") {
                    $('.img-profile').attr('src', getSafeDriveImageUrl(currentUser.foto));
                }

                const startStr = $('#filter-start-date').val() || '';
                const endStr = $('#filter-end-date').val() || '';

                $('#adminAttendanceTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');
                $('#usersTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');
                $('#dutiesTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');

                // =====================================================
                // FASE 1: Datos críticos — carga rápida (stats, users, attendance)
                // =====================================================
                google.script.run.withFailureHandler(function (err) {
                    showNotification("Error", "Error de conexión o autorización: " + (err ? err.message : "Desconocido"), "danger");
                }).withSuccessHandler(function (data) {
                    if (!data || data.error) {
                        const errorMsg = (data && data.error) ? data.error : "Conflicto de permisos o sesión expirada. Si tienes varias cuentas de Google abiertas en este navegador, por favor abre la aplicación en una ventana de incógnito.";
                        showNotification("Error", "Error al cargar datos del panel: " + errorMsg, "danger");
                        return;
                    }
                    cachedAdminData = data; window.cachedAdminData = data;

                    // Aplicar restricciones de pestañas y tarjetas según permisos dinámicos y sub-rol
                    const tabsAdmin = [
                        { id: '#dashboard-tab', cardId: '#card-dashboard', action: 'dashboard' },
                        { id: '#users-tab', cardId: '#card-users', action: 'users' },
                        { id: '#permissions-tab', cardId: '#card-permissions', action: 'permissions' },
                        { id: '#duties-tab', cardId: '#card-duties', action: 'duties' },
                        { id: '#hours-report-tab', cardId: '#card-hours-report', action: 'hours-report' },
                        { id: '#suplencias-tab', cardId: '#card-suplencias', action: 'suplencias' },
                        { id: '#areas-tab', cardId: '#card-areas', action: 'areas' },
                        { id: '#warnings-tab', cardId: '#card-warnings', action: 'warnings' },
                        { id: '#audit-tab', cardId: '#card-audit', action: 'audit' },
                        { id: '#delete-requests-tab', cardId: '#card-delete-requests', action: 'delete-requests' },
                        { id: '#access-rules-tab', cardId: '#card-access-rules', action: 'access-rules' },
                        { id: '#admin-schedules-tab', cardId: '#card-admin-schedules', action: 'admin-schedules' },
                        { id: '#reports-tab', cardId: '#card-reports', action: 'reports' },
                        { id: '#manual-requests-tab', cardId: '#card-manual-requests', action: 'manual-requests' }
                    ];

                    tabsAdmin.forEach(tab => {
                        if (hasPermission('AdminDashboard', tab.action)) {
                            $(tab.id).closest('li').show();
                            $(tab.cardId).show();
                        } else {
                            $(tab.id).closest('li').hide();
                            $(tab.cardId).hide();
                        }
                    });

                    // Navegación interactiva mediante tarjetas
                    $('#home-panel').on('click', '.menu-card', function () {
                        const target = $(this).data('target');
                        if (target) {
                            $(target).tab('show');
                        }
                    });



                    // --- Listeners de Refresco ---
                    $('#refresh-admin-attendance').on('click', function () {
                        cachedAdminData.attendance = null;
                        populateAdminAttendanceTable();
                    });
                    $('#refresh-users').on('click', function () {
                        cachedAdminData.users = null;
                        populateUsersManagementTable();
                    });
                    $('#refresh-permissions').on('click', function () {
                        cachedAdminData.permissions = null;
                        populateAdminPermissionsTable();
                    });
                    $('#refresh-duties').on('click', function () {
                        cachedAdminData.duties = null;
                        populateDutiesTable();
                    });
                    $('#refresh-hours').on('click', function () {
                        cachedAdminData.hoursReport = null;
                        populateHoursReportTable();
                    });
                    $('#refresh-substitutions').on('click', function () {
                        cachedAdminData.substitutions = null;
                        populateSubstitutionsTable();
                    });
                    $('#refresh-cross').on('click', function () {
                        cachedAdminData.crossTurnos = null;
                        populateCrossTable();
                    });
                    $('#admin-refresh-schedules-btn').on('click', function () {
                        cachedAdminData.schedules = null;
                        populateAdminSchedulesTable();
                    });
                    $('#refresh-manual-requests-btn').on('click', function () {
                        cachedAdminData.manualRequests = null;
                        populateAdminManualRequestsTable();
                    });

                    // --- Listeners Dashboard (filtros de fecha sin recargar todo) ---
                    $('#filter-start-date, #filter-end-date').on('change', function () {
                        refreshAdminDashboardData();
                    });
                    $('#clear-filter-btn').on('click', function () {
                        $('#filter-start-date, #filter-end-date').val('');
                        refreshAdminDashboardData();
                    });

                    // --- Listeners Horas ---
                    $('#hours-filter-start-date, #hours-filter-end-date').on('change', populateHoursReportTable);
                    $('#hours-clear-filter-btn').on('click', function () {
                        $('#hours-filter-start-date, #hours-filter-end-date').val('');
                        populateHoursReportTable();
                    });
                    $('#export-complete-report-btn').on('click', handleCompleteExport);

                    $('#refresh-absent-list-btn').on('click', function () {
                        cachedAdminData.absentees = null;
                        populateTodaysAbsentees();
                    });
                    $('#refresh-open-sessions-btn').on('click', function () {
                        cachedAdminData.openSessions = null;
                        populateOpenSessions();
                    });

                    // --- Listeners Usuarios y Foto de Perfil ---
                    $('#add-user-btn').on('click', handleAddUser);
                    $('#usersTable tbody').on('click', '.edit-user-btn', handleEditUser);
                    $('#usersTable tbody').on('click', '.delete-user-btn', handleDeleteUser);
                    $('#user-form').on('submit', handleSaveUser);
                    $('#backfill-dates-btn').on('click', handleBackfillDates);
                    $('#btn-hash-passwords-superadmin').on('click', handleHashPasswordsSuperAdmin);

                    // Visibilidad exclusiva para SuperAdmin (los coordinadores generales no lo ven)
                    if (currentUser && normalizeSubRol(currentUser.subRol) === 'superadmin') {
                        $('#btn-hash-passwords-superadmin').show();
                    } else {
                        $('#btn-hash-passwords-superadmin').hide();
                    }

                    $('#form-user-foto-file').on('change', function (e) {
                        const file = e.target.files[0];
                        if (!file) return;

                        const reader = new FileReader();
                        reader.onload = function (event) {
                            const dataUrl = event.target.result;
                            const base64Data = dataUrl.split(',')[1];
                            const mimeType = file.type;
                            const filename = file.name;

                            const saveBtn = $('#save-user-btn');
                            const originalText = saveBtn.html();
                            saveBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Subiendo foto...');

                            google.script.run.withSuccessHandler(function (res) {
                                saveBtn.prop('disabled', false).html(originalText);
                                if (res.success) {
                                    $('#form-user-foto-url').val(res.url);
                                    $('#foto-preview').attr('src', getSafeDriveImageUrl(res.url));
                                    $('#foto-preview-container').show();
                                } else {
                                    showNotification('Error', 'No se pudo subir la foto: ' + res.message, 'danger');
                                }
                            }).withFailureHandler(function (err) {
                                saveBtn.prop('disabled', false).html(originalText);
                                showNotification('Error', 'Fallo al subir: ' + err.message, 'danger');
                            }).uploadProfilePhoto(base64Data, filename, mimeType);
                        };
                        reader.readAsDataURL(file);
                    });

                    // --- Listeners Guardias ---
                    $('#duty-form').on('submit', handleSaveDuty);
                    $('#dutiesTable tbody').on('click', '.delete-duty-btn', handleDeleteDuty);
                    $('#duty-category-select').on('change', function () {
                        if ($(this).val() === 'Otros') {
                            $('#duty-custom-category-group').show();
                            $('#duty-custom-category').attr('required', true);
                        } else {
                            $('#duty-custom-category-group').hide();
                            $('#duty-custom-category').removeAttr('required').val('');
                        }
                    });

                    // --- Listeners Permisos ---
                    $('#create-permission-btn').on('click', handleAdminCreatePermission);
                    $('#admin-permission-form').on('submit', handleAdminSavePermission);
                    $('#adminPermissionsTable tbody').on('click', '.approve-permission-btn', function () { handleUpdatePermissionStatus(this, 'Aprobado'); });
                    $('#adminPermissionsTable tbody').on('click', '.reject-permission-btn', function () { handleUpdatePermissionStatus(this, 'Rechazado'); });
                    $('#adminPermissionsTable tbody').on('click', '.delete-permission-btn', handleDeletePermission);

                    // --- Listeners Detalle de Horas ---
                    $('#hoursReportTable tbody').on('click', '.view-detail-btn', function () {
                        const rowData = hoursReportTable.row($(this).closest('tr')).data();
                        currentDetailedUserId = rowData.userId;
                        $('#detailed-report-modal-title').text('Reporte Detallado de: ' + rowData.name);
                        $('#detail-start-date').val($('#hours-filter-start-date').val());
                        $('#detail-end-date').val($('#hours-filter-end-date').val());
                        populateDetailedReportTable();
                    });
                    $('#detail-generate-report-btn').on('click', populateDetailedReportTable);

                    $('#detail-this-month-btn').on('click', function () {
                        const today = new Date();
                        $('#detail-start-date').val(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
                        $('#detail-end-date').val(new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]);
                        populateDetailedReportTable();
                    });
                    $('#detail-last-month-btn').on('click', function () {
                        const today = new Date();
                        $('#detail-start-date').val(new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0]);
                        $('#detail-end-date').val(new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0]);
                        populateDetailedReportTable();
                    });

                    // --- Listeners Cierre Forzado ---
                    $('#open-sessions-list').on('click', '.force-close-btn', handleForceClockOutModal);
                    $('#force-clock-out-form').on('submit', handleSaveForceClockOut);

                    // --- Listeners Suplencias Formales ---
                    $('#add-substitution-btn').on('click', showSubstitutionModal);
                    $('#substitution-form').on('submit', handleSaveSubstitution);
                    $('#substitutionsTable tbody').on('click', '.approve-sub-btn', function () { handleUpdateSubstitutionStatus(this, 'Aprobada'); });
                    $('#substitutionsTable tbody').on('click', '.reject-sub-btn', function () { handleUpdateSubstitutionStatus(this, 'Rechazada'); });
                    $('#substitutionsTable tbody').on('click', '.delete-sub-btn', handleDeleteSubstitution);

                    // --- Listeners Cross de Turno (Admin Directo) ---
                    let options = '<option value="">Seleccione usuario...</option>';
                    if (cachedAdminData.users) {
                        cachedAdminData.users.forEach(function (u) {
                            if (u.role !== 'Admin' && u.estado === 'Activo') {
                                options += '<option value="' + u.userId + '">' + u.name + ' (' + u.turno + ')</option>';
                            }
                        });
                    }
                    $('#cross-user-1, #cross-user-2').html(options);

                    $('#btn-register-cross').on('click', function () {
                        const date = $('#cross-date').val();
                        const u1 = $('#cross-user-1').val();
                        const u2 = $('#cross-user-2').val();

                        if (!date || !u1 || !u2) return showNotification("Atención", "Todos los campos son obligatorios.", "warning");
                        if (u1 === u2) return showNotification("Atención", "Debe seleccionar dos operadores diferentes.", "warning");

                        $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Registrando...');

                        google.script.run.withSuccessHandler(function (res) {
                            $('#btn-register-cross').prop('disabled', false).html('<i class="fas fa-check"></i> Registrar Cross');
                            if (res.success) {
                                showNotification("Éxito", res.message, "success");
                                $('#cross-date, #cross-user-1, #cross-user-2').val('');
                                cachedAdminData.crossTurnos = null;
                                populateCrossTable();
                                populateHoursReportTable();
                            } else {
                                showNotification("Error", res.message, "danger");
                            }
                        }).withFailureHandler(function (err) {
                            $('#btn-register-cross').prop('disabled', false).html('<i class="fas fa-check"></i> Registrar Cross');
                            showNotification("Error", err.message, "danger");
                        }).registerCrossTurno(date, u1, u2);
                    });
                    $('#crossTable tbody').on('click', '.approve-cross-btn', function () { handleUpdateCrossStatus(this, 'Aprobada'); });
                    $('#crossTable tbody').on('click', '.reject-cross-btn', function () { handleUpdateCrossStatus(this, 'Rechazada'); });
                    $('#crossTable tbody').on('click', '.delete-cross-btn', handleDeleteCross);

                    // --- Listeners de Refresco de áreas, auditoría, solicitudes, etc ---
                    $('#refresh-areas-btn').on('click', function () {
                        cachedAdminData.areas = null;
                        populateAreasTable();
                    });
                    $('#refresh-audit-btn').on('click', function () {
                        cachedAdminData.auditLog = null;
                        populateAuditTable();
                    });
                    $('#refresh-delete-requests-btn').on('click', function () {
                        cachedAdminData.deleteRequests = null;
                        populateDeleteRequestsTable();
                    });
                    $('#refresh-access-rules-btn').on('click', function () {
                        cachedAdminData.accessRules = null;
                        populateAccessRules();
                    });

                    // --- Listeners de Formulario de Áreas ---
                    $('#area-form').on('submit', handleSaveArea);
                    $('#areasTable tbody').on('click', '.rename-area-btn', handleRenameArea);
                    $('#areasTable tbody').on('click', '.delete-area-btn', handleDeleteArea);

                    // --- Listeners de Auditoría ---
                    $('#apply-audit-filter-btn').on('click', function () {
                        cachedAdminData.auditLog = null;
                        populateAuditTable();
                    });
                    $('#clear-audit-filter-btn').on('click', function () {
                        $('#audit-filter-start, #audit-filter-end, #audit-filter-module, #audit-filter-action').val('');
                        cachedAdminData.auditLog = null;
                        populateAuditTable();
                    });

                    // --- Listeners de Solicitudes de Baja ---
                    $('#deleteRequestsTable tbody').on('click', '.approve-baja-btn', function () { handleResolveDeleteRequest(this, 'Aprobada'); });
                    $('#deleteRequestsTable tbody').on('click', '.reject-baja-btn', function () { handleResolveDeleteRequest(this, 'Rechazada'); });

                    // --- Selector de SubRol a Rol automático (normalizado para tolerancia a acentos) ---
                    $('#form-user-subrol').on('change', function () {
                        const subRolNorm = normalizeSubRol($(this).val());
                        if (subRolNorm === 'coordinador general' || subRolNorm === 'coordinador de area' || subRolNorm === 'superadmin') {
                            $('#form-user-role').val('Admin');
                        } else {
                            $('#form-user-role').val('Usuario');
                        }
                    });

                    // --- Listener botón de reportes ---
                    $('#btn-generate-report-admin').on('click', function () {
                        openReportGenerator('admin');
                    });

                    // --- INICIALIZACIONES ---
                    generateMasterQRCode();
                    initAdminAttendanceTable();
                    initUsersManagementTable();
                    initDutiesTable();
                    initHoursReportTable();
                    initDetailedReportTable();
                    initAdminPermissionsTable();
                    initSubstitutionsTable();
                    initCrossTable();

                    // --- INICIALIZACIONES DE NUEVAS TABLAS ---
                    initAreasTable();
                    initAuditTable();
                    initDeleteRequestsTable();
                    initAccessRules();
                    initAdminSchedulesTable();
                    initAdminApprovedSchedulesTable();
                    initAdminManualRequestsTable();

                    $('#adminManualRequestsTable tbody').on('click', '.approve-request-btn', function () {
                        handleResolveManualRequest(this, 'Aprobada');
                    });
                    $('#adminManualRequestsTable tbody').on('click', '.reject-request-btn', function () {
                        handleResolveManualRequest(this, 'Rechazada');
                    });

                    updateAdminView();
                    populateTodaysAbsentees();
                    populateOpenSessions();

                    $('a[data-toggle="tab"]').on('shown.bs.tab', function () {
                        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                    });

                    $('#usersTable tbody').on('click', '.admin-add-entry-btn', function () { handleAdminManualRecord(this, 'Entrada'); });
                    $('#usersTable tbody').on('click', '.admin-add-exit-btn', function () { handleAdminManualRecord(this, 'Salida'); });

                    // --- Listeners de Amonestaciones (Admin) ---
                    $('#config-horarios-form').on('submit', handleSaveConfigHorarios);
                    $('#setup-triggers-btn').on('click', handleSetupTriggers);

                    $('#new-warning-type-btn').on('click', function () {
                        $('#warning-type-form')[0].reset();
                        $('#form-warning-type-id').val('');
                        $('#warning-type-modal-title').html('<i class="fas fa-tag mr-1"></i> Nuevo Tipo de Amonestación');
                        $('#auto-condition-wrapper').hide();
                        $('#warningTypeModal').modal('show');
                    });
                    $('#form-warning-type-auto').on('change', function () {
                        if ($(this).is(':checked')) $('#auto-condition-wrapper').show();
                        else $('#auto-condition-wrapper').hide();
                    });
                    $('#warning-type-form').on('submit', handleSaveWarningType);

                    $('#new-admin-warning-btn').on('click', function () {
                        $('#admin-create-warning-form')[0].reset();
                        const userSelect = $('#form-admin-warning-user').html('<option value="">Cargando...</option>');
                        const typeSelect = $('#form-admin-warning-type').html('<option value="">Cargando...</option>');

                        if (cachedAdminData.users) {
                            userSelect.empty().append('<option value="" disabled selected>Seleccione usuario...</option>');
                            cachedAdminData.users.forEach(function (u) {
                                if (u.estado === 'Activo') userSelect.append('<option value="' + u.userId + '">' + u.name + ' (' + u.subRol + ')</option>');
                            });
                        }
                        if (cachedAdminData.warningTypes) {
                            typeSelect.empty().append('<option value="" disabled selected>Seleccione tipo...</option>');
                            cachedAdminData.warningTypes.forEach(function (t) {
                                if (t.estado === 'Activo') typeSelect.append('<option value="' + t.tipoId + '">' + t.nombre + ' (' + t.gravedad + ')</option>');
                            });
                        }
                        $('#adminCreateWarningModal').modal('show');
                    });
                    $('#admin-create-warning-form').on('submit', handleSaveAdminWarning);

                    $('#apply-warning-filters-btn').on('click', populateAdminWarningsTable);
                    $('#clear-warning-filters-btn').on('click', function () {
                        $('#warning-filter-user').val('');
                        $('#warning-filter-status').val('');
                        populateAdminWarningsTable();
                    });
                    $('#refresh-warnings-btn').on('click', populateAdminWarningsTable);

                    $('#warningTypesTable tbody').on('click', '.edit-warning-type-btn', handleEditWarningType);
                    $('#warningTypesTable tbody').on('click', '.delete-warning-type-btn', handleDeleteWarningType);
                    $('#adminWarningsTable tbody').on('click', '.anular-warning-btn', handleAnularWarning);

                    $('#adminAnulacionesTable tbody').on('click', '.approve-wanul-btn', function () { handleResolveWarningAnulacion(this, 'Aprobada'); });
                    $('#adminAnulacionesTable tbody').on('click', '.reject-wanul-btn', function () { handleResolveWarningAnulacion(this, 'Rechazada'); });

                    // Initialize Admin warnings
                    initWarningTypesTable();
                    initAdminWarningsTable();
                    initAdminAnulacionesTable();
                    populateConfigHorarios();

                    // Populating users filter
                    const filterUser = $('#warning-filter-user').html('<option value="">Todos los usuarios</option>');
                    if (cachedAdminData.users) {
                        cachedAdminData.users.forEach(function (u) {
                            filterUser.append('<option value="' + u.userId + '">' + u.name + '</option>');
                        });
                    }

                    // =====================================================
                    // FASE 2: Datos secundarios — carga en background
                    // =====================================================
                    const phase2Banner = $('<div class="alert alert-info alert-dismissible py-1 px-2 mb-2" id="phase2-loading-banner" style="font-size:0.85em;"><i class="fas fa-sync fa-spin mr-1"></i> Cargando datos adicionales en segundo plano...</div>');
                    $('#admin-panel-body, .tab-content').first().prepend(phase2Banner);

                    google.script.run.withFailureHandler(function () {
                        $('#phase2-loading-banner').remove();
                    }).withSuccessHandler(function (phase2Data) {
                        if (phase2Data && !phase2Data.error) {
                            Object.assign(cachedAdminData, phase2Data);
                            // Refrescar tablas secundarias con los datos recién llegados
                            populateDutiesTable();
                            populateHoursReportTable();
                            populateAdminPermissionsTable();
                            populateSubstitutionsTable();
                            populateCrossTable();
                            populateAuditTable();
                            populateDeleteRequestsTable();
                            populateAccessRules();
                            populateAreasTable();
                            populateWarningTypesTable();
                            populateAdminWarningsTable();
                            populateAdminAnulacionesTable();
                            populateAdminSchedulesTable();
                            populateAdminApprovedSchedulesTable();
                            populateAdminManualRequestsTable();
                            // Populate warning filter users
                            if (phase2Data.warningTypes) {
                                const warnFilterUser = $('#warning-filter-user');
                                warnFilterUser.html('<option value="">Todos los usuarios</option>');
                                if (cachedAdminData.users) {
                                    cachedAdminData.users.forEach(function (u) {
                                        warnFilterUser.append('<option value="' + u.userId + '">' + u.name + '</option>');
                                    });
                                }
                            }
                        }
                        $('#phase2-loading-banner').fadeOut(500, function () { $(this).remove(); });
                    }).getAdminDashboardData_Phase2(startStr, endStr);

                }).getAdminDashboardData_Phase1(startStr, endStr);
            });
        }

        // ---- Refresco ligero de datos filtrados por fecha (sin recargar HTML) ----
        function refreshAdminDashboardData() {
            const startStr = $('#filter-start-date').val() || '';
            const endStr = $('#filter-end-date').val() || '';
            const refreshBtn = $('#filter-start-date, #filter-end-date');

            google.script.run.withFailureHandler(function (err) {
                showNotification("Error", "Error al refrescar datos: " + (err ? err.message : "Desconocido"), "danger");
            }).withSuccessHandler(function (filteredData) {
                if (!filteredData || filteredData.error) return;
                // Actualizar solo los datos filtrados en el cache
                if (filteredData.stats) cachedAdminData.stats = filteredData.stats;
                if (filteredData.attendance) cachedAdminData.attendance = filteredData.attendance;
                if (filteredData.hoursReport) cachedAdminData.hoursReport = filteredData.hoursReport;
                // Repintar las tablas afectadas por el filtro de fecha
                updateAdminView();
                populateAdminAttendanceTable();
                populateHoursReportTable();
            }).refreshAdminDashboardFiltered(startStr, endStr);
        }

        function populateOpenSessions() {
            const listContainer = $('#open-sessions-list');
            listContainer.html('<div class="list-group-item text-center"><div class="spinner-border spinner-border-sm"></div></div>');
            google.script.run.withSuccessHandler(function (sessions) {
                listContainer.empty();
                if (sessions.length === 0) {
                    listContainer.html('<div class="list-group-item list-group-item-success text-center"><i class="fas fa-check-circle"></i> No hay sesiones abiertas.</div>');
                } else {
                    sessions.forEach(function (session) {
                        const entryDate = new Date(session.entryTimestamp);
                        const formattedDate = entryDate.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

                        const rowHtml = '<div class="list-group-item d-flex justify-content-between align-items-center">' +
                            '<div><h6 class="mb-0">' + session.name + '</h6><small class="text-muted">Entrada: ' + formattedDate + '</small></div>' +
                            '<button class="btn btn-warning btn-sm force-close-btn" data-user-id="' + session.userId + '" data-user-name="' + session.name + '" data-entry-time="' + session.entryTimestamp + '" title="Cerrar Manualmente"><i class="fas fa-sign-out-alt"></i></button>' +
                            '</div>';
                        listContainer.append(rowHtml);
                    });
                }
            }).withFailureHandler(function (err) {
                listContainer.html('<div class="list-group-item list-group-item-danger">Error: ' + err.message + '</div>');
            }).getOpenAttendanceSessions();
        }

        function handleForceClockOutModal() {
            const userId = $(this).data('user-id');
            const userName = $(this).data('user-name');
            const entryTimestamp = $(this).data('entry-time');
            const entryDate = new Date(entryTimestamp);
            const suggestedExitDate = new Date(entryDate.getTime() + 8 * 60 * 60 * 1000);

            $('#force-user-id').val(userId);
            $('#force-user-name').text(userName);
            $('#force-entry-time').text(entryDate.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' }));
            $('#force-date').val(suggestedExitDate.toISOString().split('T')[0]);
            $('#force-time').val(suggestedExitDate.toTimeString().split(' ')[0].substring(0, 5));

            $('#forceClockOutModal').modal('show');
        }

        function handleSaveForceClockOut(e) {
            e.preventDefault();
            const btn = $('#save-force-clock-out-btn');
            const original = btn.html();

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');

            const details = {
                userId: $('#force-user-id').val(),
                dateTimeString: $('#force-date').val() + 'T' + $('#force-time').val() + ':00'
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(original);
                if (res.success) {
                    $('#forceClockOutModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateOpenSessions();
                    populateAdminAttendanceTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(original);
                showNotification('Error', err.message, 'danger');
            }).adminForceClockOut(details);
        }

        // --- TABLA: SUPLENCIAS NORMALES ---
        function initSubstitutionsTable() {
            substitutionsTable = $('#substitutionsTable').DataTable({
                data: [],
                columns: [
                    { data: 'titularName' },
                    { data: 'suplenteName' },
                    { data: 'startDate', className: 'dt-center' },
                    { data: 'endDate', className: 'dt-center' },
                    { data: 'titularTurno', className: 'dt-center' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary', i = 'fas fa-info-circle';
                            if (d.includes('Aprobada')) { b = 'success'; i = 'fas fa-check-circle'; }
                            else if (d === 'Pendiente de Admin' || d === 'Pendiente') { b = 'primary'; i = 'fas fa-user-shield'; }
                            else if (d === 'Pendiente de Titular') { b = 'warning'; i = 'fas fa-user-clock'; }
                            else if (d === 'Rechazada') { b = 'danger'; i = 'fas fa-times-circle'; }
                            else if (d === 'Disponible') { b = 'secondary'; i = 'fas fa-info-circle'; }
                            return '<span class="badge badge-' + b + '"><i class="' + i + ' mr-1"></i>' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            if (r.estado === 'Pendiente de Admin' || r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-success btn-sm approve-sub-btn" title="Aprobar Suplencia" data-id="' + r.subId + '"><i class="fas fa-check"></i></button> ';
                            }
                            if (r.estado === 'Pendiente de Admin' || r.estado === 'Pendiente de Titular' || r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-warning btn-sm reject-sub-btn" title="Rechazar Suplencia" data-id="' + r.subId + '"><i class="fas fa-times"></i></button> ';
                            }
                            if (r.estado !== 'Aprobada') {
                                actions += '<button class="btn btn-danger btn-sm delete-sub-btn" title="Eliminar" data-id="' + r.subId + '"><i class="fas fa-trash"></i></button>';
                            }
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                order: [[2, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateSubstitutionsTable();
        }

        function populateSubstitutionsTable() {
            if (!substitutionsTable) return;
            if (cachedAdminData && cachedAdminData.substitutions) {
                substitutionsTable.clear().rows.add(cachedAdminData.substitutions).draw();
                return;
            }
            $('#substitutionsTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');

            google.script.run.withSuccessHandler(function (subs) {
                substitutionsTable.clear().rows.add(subs).draw();
            }).withFailureHandler(function (err) {
                $('#substitutionsTable tbody').html('<tr><td colspan="7" class="text-danger text-center">Error al cargar datos.</td></tr>');
            }).getSubstitutions();
        }

        function handleDeleteSubstitution() {
            const subId = $(this).data('id');
            if (!confirm('¿Seguro de eliminar este registro?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateSubstitutionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).deleteSubstitution(subId);
        }

        function showSubstitutionModal() {
            $('#substitution-form')[0].reset();
            const titularSel = $('#sub-titular').html('<option value="">Cargando...</option>');
            const suplenteSel = $('#sub-suplente').html('<option value="">Cargando...</option>');

            google.script.run.withSuccessHandler(function (users) {
                const nonAdminUsers = users.filter(function (u) { return u.role !== 'Admin' && u.estado === 'Activo'; });
                titularSel.empty().append('<option value="" disabled selected>Seleccione...</option>');
                suplenteSel.empty().append('<option value="" disabled selected>Seleccione...</option>');

                nonAdminUsers.forEach(function (u) {
                    titularSel.append('<option value="' + u.userId + '">' + u.name + ' (' + u.turno + ')</option>');
                    suplenteSel.append('<option value="' + u.userId + '">' + u.name + ' (' + u.turno + ')</option>');
                });
                $('#substitutionModal').modal('show');
            }).getAllUsersForAdmin();
        }

        function handleSaveSubstitution(e) {
            e.preventDefault();
            const btn = $('#save-substitution-btn');
            const original = btn.html();

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');

            const data = {
                titularId: $('#sub-titular').val(),
                suplenteId: $('#sub-suplente').val(),
                startDate: $('#sub-start-date').val(),
                endDate: $('#sub-end-date').val(),
                startTime: $('#sub-start-time').val(),
                endTime: $('#sub-end-time').val(),
                comentarios: $('#sub-comentarios').val()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(original);
                if (res.success) {
                    $('#substitutionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateSubstitutionsTable();
                } else {
                    showNotification('Error de Validación', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(original);
                showNotification('Error de Servidor', err.message, 'danger');
            }).createSubstitution(data);
        }

        function handleUpdateSubstitutionStatus(button, newStatus) {
            const subId = $(button).data('id');
            if (!confirm('¿Seguro que desea ' + newStatus + ' esta suplencia?')) return;

            const icon = $(button).html();
            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateSubstitutionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(icon);
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                $(button).prop('disabled', false).html(icon);
            }).updateSubstitutionStatus(subId, newStatus, currentUser.userId);
        }

        // --- TABLA: CROSS DE TURNO ---
        function initCrossTable() {
            crossTable = $('#crossTable').DataTable({
                data: [],
                columns: [
                    { data: 'date', className: 'dt-center' },
                    { data: null, render: function (r) { return r.u1Name + ' (' + r.u1Turno + ')'; } },
                    { data: null, render: function (r) { return r.u2Name + ' (' + r.u2Turno + ')'; } },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let badge = 'secondary';
                            if (d === 'Aprobada') badge = 'success';
                            else if (d.includes('Pendiente')) badge = 'warning';
                            else if (d === 'Rechazada') badge = 'danger';
                            return '<span class="badge badge-' + badge + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (r) {
                            let actions = '<div class="btn-group">';
                            if (r.estado === 'Pendiente de Admin') {
                                actions += '<button class="btn btn-success btn-sm approve-cross-btn" title="Aprobar" data-id="' + r.crossId + '"><i class="fas fa-check"></i></button>';
                                actions += '<button class="btn btn-warning btn-sm reject-cross-btn" title="Rechazar" data-id="' + r.crossId + '"><i class="fas fa-times"></i></button>';
                            }
                            actions += '<button class="btn btn-danger btn-sm delete-cross-btn" title="Eliminar" data-id="' + r.crossId + '"><i class="fas fa-trash"></i></button>';
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCrossTable();
        }

        function populateCrossTable() {
            if (!crossTable) return;
            if (cachedAdminData && cachedAdminData.crossTurnos) {
                crossTable.clear().rows.add(cachedAdminData.crossTurnos).draw();
                return;
            }
            $('#crossTable tbody').html('<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (d) {
                crossTable.clear().rows.add(d).draw();
            }).getCrossTurnosList();
        }

        function handleUpdateCrossStatus(btn, status) {
            const id = $(btn).data('id');
            if (!confirm('¿' + status + ' este Cross de Turno?')) return;

            const icon = $(btn).html();
            $(btn).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCrossTable();
                    populateHoursReportTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(btn).prop('disabled', false).html(icon);
                }
            }).updateCrossStatus(id, status);
        }

        function handleDeleteCross() {
            const id = $(this).data('id');
            if (!confirm('¿Eliminar este Cross de Turno?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCrossTable();
                    populateHoursReportTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).deleteCrossTurno(id);
        }

        // --- Funciones de Gestión de Usuarios (CRUD) ---
        function populateAreasCheckboxes(selectedAreaIds = []) {
            const container = $('#areas-checkboxes-container');
            container.html('<div class="text-muted small"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando áreas...</div>');

            google.script.run.withSuccessHandler(function (areas) {
                container.empty();
                if (areas.length === 0) {
                    container.html('<div class="text-muted small">No hay áreas configuradas.</div>');
                    return;
                }
                areas.forEach(function (area) {
                    const isChecked = selectedAreaIds.indexOf(area.areaId) !== -1 ? 'checked' : '';
                    const checkboxHtml = '<div class="custom-control custom-checkbox mb-1">' +
                        '<input type="checkbox" class="custom-control-input user-area-checkbox" id="chk-area-' + area.areaId + '" value="' + area.areaId + '" ' + isChecked + '>' +
                        '<label class="custom-control-label small" for="chk-area-' + area.areaId + '">' + area.nombreArea + '</label>' +
                        '</div>';
                    container.append(checkboxHtml);
                });
            }).withFailureHandler(function (err) {
                container.html('<div class="text-danger small">Error al cargar áreas: ' + err.message + '</div>');
            }).getAreasConfig();
        }

        // --- Funciones de Gestión de Usuarios (CRUD) ---
        function handleAddUser() {
            $('#user-form')[0].reset();

            $('#foto-preview-container').hide();
            $('#form-user-foto-url').val('');
            $('#form-user-tolerancia').val('');
            $('#form-user-inclusion').val('');

            $('#user-modal-title').text('Añadir Nuevo Usuario');
            $('#form-user-id').val('');
            $('#form-user-estado').val('Activo');
            $('#form-user-password').prop('required', true);

            $('#form-user-subrol').val('Operador/a');
            $('#form-user-role').val('Usuario');
            populateAreasCheckboxes([]);

            $('#userModal').modal('show');
        }

        function handleEditUser() {
            const rowData = usersManagTable.row($(this).closest('tr')).data();
            $('#user-form')[0].reset();
            $('#user-modal-title').text('Editar Usuario: ' + rowData.name);
            $('#form-user-id').val(rowData.userId);
            $('#form-user-name').val(rowData.name);
            $('#form-user-email').val(rowData.email);
            $('#form-user-password').prop('required', false);
            $('#form-user-role').val(rowData.role);
            $('#form-user-cedula').val(rowData.cedula);
            $('#form-user-institucion').val(rowData.institucion);
            $('#form-user-telefono').val(rowData.telefono);
            $('#form-user-direccion').val(rowData.direccion);
            $('#form-user-turno').val(rowData.turno);
            $('#form-user-estado').val(rowData.estado || 'Activo');
            $('#form-user-tolerancia').val(rowData.toleranciaPersonalizada !== null && rowData.toleranciaPersonalizada !== undefined ? rowData.toleranciaPersonalizada : '');
            if (rowData.fechaInclusion === 'N/A' || !rowData.fechaInclusion) {
                $('#form-user-inclusion').val('');
            } else {
                $('#form-user-inclusion').val(rowData.fechaInclusion);
            }

            $('#form-user-subrol').val(rowData.subRol || 'Operador/a');
            populateAreasCheckboxes(rowData.areas || []);

            if (rowData.nacimiento === 'N/A' || !rowData.nacimiento) {
                $('#form-user-nacimiento').val('');
            } else {
                $('#form-user-nacimiento').val(rowData.nacimiento);
            }

            if (rowData.foto && rowData.foto !== "") {
                let validUrl = getSafeDriveImageUrl(rowData.foto);
                $('#form-user-foto-url').val(rowData.foto);
                $('#foto-preview').attr('src', validUrl);
                $('#foto-preview-container').show();
            } else {
                $('#form-user-foto-url').val('');
                $('#foto-preview-container').hide();
            }

            $('#userModal').modal('show');
        }

        function handleSaveUser(e) {
            e.preventDefault();
            const saveButton = $('#save-user-btn');
            const originalButtonText = saveButton.html();

            saveButton.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');

            const selectedAreas = [];
            $('.user-area-checkbox:checked').each(function () {
                selectedAreas.push($(this).val());
            });

            const toleranciaVal = $('#form-user-tolerancia').val();
            const toleranciaPersonalizada = (toleranciaVal === '' || isNaN(toleranciaVal)) ? null : parseInt(toleranciaVal, 10);

            const userData = {
                userId: $('#form-user-id').val(),
                name: $('#form-user-name').val(),
                email: $('#form-user-email').val(),
                password: $('#form-user-password').val(),
                role: $('#form-user-role').val(),
                cedula: $('#form-user-cedula').val(),
                institucion: $('#form-user-institucion').val(),
                telefono: $('#form-user-telefono').val(),
                direccion: $('#form-user-direccion').val(),
                turno: $('#form-user-turno').val(),
                nacimiento: $('#form-user-nacimiento').val(),
                foto: $('#form-user-foto-url').val(),
                estado: $('#form-user-estado').val() || 'Activo',
                subRol: $('#form-user-subrol').val(),
                areas: selectedAreas,
                toleranciaPersonalizada: toleranciaPersonalizada,
                fechaInclusion: $('#form-user-inclusion').val(),
                actorUserId: currentUser.userId
            };

            const operation = userData.userId ? 'updateUser' : 'addNewUser';

            google.script.run.withSuccessHandler(function (response) {
                saveButton.prop('disabled', false).html(originalButtonText);
                if (response.success) {
                    $('#userModal').modal('hide');
                    showNotification('Éxito', response.message, 'success');
                    populateUsersManagementTable();
                } else {
                    showNotification('Error', response.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                saveButton.prop('disabled', false).html(originalButtonText);
                showNotification('Error de Servidor', err.message, 'danger');
            })[operation](userData);
        }

        function handleBackfillDates() {
            if (!confirm("¿Deseas sincronizar y autocompletar las fechas de ingreso/inclusión de todos los usuarios utilizando su primer registro de asistencia?")) return;
            const btn = $('#backfill-dates-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Sincronizando...');

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    cachedAdminData.users = null;
                    populateUsersManagementTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error de Servidor', err.message, 'danger');
            }).backfillFechaInclusion();
        }

        function handleHashPasswordsSuperAdmin() {
            if (!currentUser || normalizeSubRol(currentUser.subRol) !== 'superadmin') {
                showNotification('Acceso Denegado', 'Esta función es exclusiva del SuperAdmin.', 'danger');
                return;
            }

            if (!confirm('¿Deseas blindar todas las contraseñas en la base de datos?\n\nAquellas que aún estén en texto plano serán convertidas a un hash criptográfico SHA-256 con Salt. Los usuarios podrán seguir iniciando sesión con su misma contraseña con total normalidad.')) return;

            const btn = $('#btn-hash-passwords-superadmin');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Blindando...');

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res && res.success) {
                    showNotification('Seguridad Aplicada', res.message || 'Contraseñas blindadas correctamente.', 'success');
                    cachedAdminData.users = null;
                    populateUsersManagementTable();
                } else {
                    showNotification('Error', (res && res.message) ? res.message : 'No se pudo completar el blindaje.', 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error de Servidor', err ? err.message : 'Error desconocido.', 'danger');
            }).migrarContrasenasAHash();
        }

        function handleDeleteUser() {
            const rowData = usersManagTable.row($(this).closest('tr')).data();
            if (!confirm('¿Eliminar al usuario "' + rowData.name + '"? Esta acción no se puede deshacer.')) return;
            const originalIcon = $(this).html();
            $(this).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
            const btn = $(this);

            google.script.run.withSuccessHandler(function (response) {
                btn.prop('disabled', false).html(originalIcon);
                if (response.success) {
                    showNotification('Éxito', response.message, 'success');
                    populateUsersManagementTable();
                } else {
                    showNotification('Error', response.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(originalIcon);
                showNotification('Error', err.message, 'danger');
            }).deleteUser(rowData.userId, currentUser ? currentUser.userId : null);
        }

        // --- Exportación Específica en Tabla de Usuarios ---
        function initUsersManagementTable() {
            usersManagTable = $('#usersTable').DataTable({
                destroy: true,
                data: [],
                columns: [
                    {
                        title: 'Foto', data: 'foto', className: "dt-center", render: function (d) {
                            if (d && String(d).startsWith('http')) {
                                let imgUrl = getSafeDriveImageUrl(d);
                                return '<img src="' + imgUrl + '" class="clickable-photo" style="width:40px;height:40px;border-radius:50%;object-fit:cover;box-shadow:0 2px 5px rgba(0,0,0,0.1); cursor:pointer;" onerror="this.outerHTML=\'<i class=\\\'fas fa-user-circle fa-2x text-gray-300\\\'></i>\'">';
                            }
                            return '<i class="fas fa-user-circle fa-2x text-gray-300"></i>';
                        }
                    },
                    { title: 'Nombre', data: 'name' },
                    { title: 'Email', data: 'email', className: "dt-center" },
                    { title: 'Rol del Sistema', data: 'role', className: "dt-center", render: function (d) { return '<span class="badge badge-secondary">' + d + '</span>'; } },
                    { title: 'Sub-Rol', data: 'subRol', className: "dt-center", render: function (d) { return '<span class="badge badge-primary">' + (d || 'Operador/a') + '</span>'; } },
                    {
                        title: 'Áreas', data: 'areas', className: "dt-center", render: function (d) {
                            if (!d || d.length === 0) return '<span class="text-muted small">Sin área</span>';
                            return d.map(a => '<span class="badge badge-info mr-1">' + a + '</span>').join('');
                        }
                    },
                    { title: 'Cédula', data: 'cedula', className: "dt-center" },
                    { title: 'Institución', data: 'institucion', className: "dt-center" },
                    { title: 'Nacimiento', data: 'nacimiento', className: "dt-center" },
                    { title: 'Turno', data: 'turno', className: "dt-center" },
                    { title: 'Teléfono', data: 'telefono', className: "dt-center", visible: false },
                    { title: 'Dirección', data: 'direccion', className: "dt-center", visible: false },
                    {
                        title: 'Estado', data: 'estado', className: "dt-center", render: function (d) {
                            let b = (d === 'Inactivo' ? 'danger' : 'success');
                            return '<span class="badge badge-' + b + '">' + (d || 'Activo') + '</span>';
                        }
                    },
                    {
                        title: 'Desde', data: 'fechaInclusion', className: "dt-center", render: function (d) {
                            return d || 'N/A';
                        }
                    },
                    { title: 'ID', data: 'userId', visible: false },
                    {
                        title: 'Equipo', data: 'dispositivoVinculadoId', className: "dt-center", render: function (d, t, r) {
                            if (d) {
                                return '<span class="badge badge-success" title="' + (r.dispositivoInfo || '') + '"><i class="fas fa-mobile-alt mr-1"></i> Vinculado</span>';
                            }
                            return '<span class="badge badge-secondary"><i class="fas fa-question-circle mr-1"></i> Sin vincular</span>';
                        }
                    },
                    {
                        title: 'Acciones', data: null, className: "dt-center", orderable: false, render: function (d, t, r) {
                            let resetBtn = '';
                            if (r.dispositivoVinculadoId) {
                                resetBtn = '<button class="btn btn-secondary btn-sm reset-device-btn" title="Desvincular Dispositivo Registrado" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-mobile-alt"></i><i class="fas fa-times text-danger ml-1"></i></button>';
                            }
                            return '<div class="btn-group" role="group">' +
                                '<button class="btn btn-success btn-sm admin-add-entry-btn" title="Entrada" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-sign-in-alt"></i></button>' +
                                '<button class="btn btn-danger btn-sm admin-add-exit-btn" title="Salida" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-sign-out-alt"></i></button>' +
                                '<button class="btn btn-warning btn-sm edit-user-btn" title="Editar"><i class="fas fa-edit"></i></button>' +
                                resetBtn +
                                '<button class="btn btn-danger btn-sm delete-user-btn" title="Eliminar"><i class="fas fa-trash-alt"></i></button>' +
                                '</div>';
                        }
                    }
                ],
                order: [[1, 'asc']],
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' },
                dom: "<'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>><'row'<'col-sm-12 mt-3'B>>",
                buttons: [
                    {
                        extend: 'excelHtml5',
                        text: '<i class="fas fa-file-excel"></i> Descargar Excel',
                        title: 'Listado de Personal - ' + new Date().toLocaleDateString(),
                        className: 'btn btn-success',
                        exportOptions: {
                            columns: [1, 2, 3, 4, 5, 8, 9, 7],
                            rows: function (idx, data, node) {
                                return (data.estado || 'Activo') !== 'Inactivo';
                            }
                        }
                    },
                    {
                        extend: 'print',
                        text: '<i class="fas fa-print"></i> Imprimir',
                        title: 'Listado de Personal - ' + new Date().toLocaleDateString(),
                        className: 'btn btn-info',
                        exportOptions: {
                            columns: [1, 2, 3, 4, 5, 8, 9, 7],
                            rows: function (idx, data, node) {
                                return (data.estado || 'Activo') !== 'Inactivo';
                            }
                        }
                    }
                ]
            });
            populateUsersManagementTable();
        }

        function populateUsersManagementTable() {
            if (cachedAdminData && cachedAdminData.users) {
                if (usersManagTable) {
                    usersManagTable.clear().rows.add(cachedAdminData.users).draw();
                }
                updateAdminView();
                return;
            }
            google.script.run.withSuccessHandler(function (users) {
                if (usersManagTable) {
                    usersManagTable.clear().rows.add(users).draw();
                }
                updateAdminView();
            }).getAllUsersForAdmin();
        }

        // --- Gestión de Guardias (CRUD) ---
        function initDutiesTable() {
            dutiesTable = $('#dutiesTable').DataTable({
                data: [],
                columns: [
                    { data: 'date', className: 'dt-center' },
                    { data: 'turno' },
                    { data: 'descripcion' },
                    { data: 'categoria', render: function (d) { return d || 'Guardia Ordinaria'; } },
                    { data: 'creadoPor' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return '<button class="btn btn-danger btn-sm delete-duty-btn" title="Eliminar" data-date="' + r.date + '"><i class="fas fa-trash-alt"></i></button>';
                        }
                    }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                dom: "t"
            });
            populateDutiesTable();
        }

        function populateDutiesTable() {
            if (dutiesTable) {
                function render(d) {
                    dutiesTable.clear().rows.add(d).draw();

                    // Dynamic Categories Populating
                    const defaultCategories = ["Guardia Ordinaria", "Guardia de Fin de Semana", "Guardia Nocturna", "Feriado"];
                    const existingCustomCategories = new Set();

                    d.forEach(function (shift) {
                        if (shift && shift.categoria && !defaultCategories.includes(shift.categoria)) {
                            existingCustomCategories.add(shift.categoria);
                        }
                    });

                    const $select = $('#duty-category-select');
                    const currentValue = $select.val();

                    // Remove previous dynamic options while keeping default ones
                    $select.find('option').each(function () {
                        const val = $(this).val();
                        if (val && !defaultCategories.includes(val) && val !== 'Otros') {
                            $(this).remove();
                        }
                    });

                    // Insert new ones before 'Otros'
                    const $otrosOption = $select.find('option[value="Otros"]');
                    existingCustomCategories.forEach(function (cat) {
                        $('<option>').val(cat).text(cat).insertBefore($otrosOption);
                    });

                    if (currentValue && $select.find('option[value="' + currentValue + '"]').length > 0) {
                        $select.val(currentValue);
                    } else {
                        $select.val('');
                    }
                }

                if (cachedAdminData && cachedAdminData.duties) {
                    render(cachedAdminData.duties);
                    return;
                }

                google.script.run.withSuccessHandler(render).getDutyShifts();
            }
        }

        function handleSaveDuty(e) {
            e.preventDefault();
            const btn = $('#save-duty-btn');
            const originalText = btn.text();

            const catSelect = $('#duty-category-select').val();
            const categoria = (catSelect === 'Otros') ? $('#duty-custom-category').val().trim() : catSelect;

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');
            const dutyData = {
                date: $('#duty-date').val(),
                turno: $('#duty-turno').val(),
                descripcion: $('#duty-description').val(),
                categoria: categoria,
                creadoPor: currentUser ? currentUser.name : 'Administrador'
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).text(originalText);
                if (res.success) {
                    $('#duty-form')[0].reset();
                    $('#duty-custom-category-group').hide();
                    $('#duty-custom-category').removeAttr('required').val('');
                    showNotification('Éxito', res.message, 'success');
                    populateDutiesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).text(originalText);
                showNotification('Error', err.message, 'danger');
            }).addDutyShift(dutyData);
        }

        function handleDeleteDuty() {
            const dutyDate = $(this).data('date');
            if (!confirm('¿Eliminar guardia del ' + dutyDate + '?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateDutiesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).deleteDutyShift(dutyDate);
        }

        // --- Gestión de Permisos (Admin) ---
        function initAdminPermissionsTable() {
            adminPermissionsTable = $('#adminPermissionsTable').DataTable({
                data: [],
                columns: [
                    { data: 'userName' },
                    { data: null, render: function (r) { return r.fechaInicio + ' al ' + r.fechaFin; } },
                    { data: 'tipoPermiso', className: 'dt-center' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Aprobado') b = 'success';
                            if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    { data: 'comentarios', render: function (d) { return d || 'N/A'; } },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            if (r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-success btn-sm approve-permission-btn" title="Aprobar" data-id="' + r.permisoId + '"><i class="fas fa-check"></i></button> ';
                                actions += '<button class="btn btn-warning btn-sm reject-permission-btn" title="Rechazar" data-id="' + r.permisoId + '"><i class="fas fa-times"></i></button> ';
                            }
                            actions += '<button class="btn btn-danger btn-sm delete-permission-btn" title="Eliminar" data-id="' + r.permisoId + '"><i class="fas fa-trash"></i></button>';
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                order: [[1, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAdminPermissionsTable();
        }

        function populateAdminPermissionsTable() {
            if (adminPermissionsTable) {
                if (cachedAdminData && cachedAdminData.permissions) {
                    adminPermissionsTable.clear().rows.add(cachedAdminData.permissions).draw();
                    return;
                }
                google.script.run.withSuccessHandler(function (d) {
                    adminPermissionsTable.clear().rows.add(d).draw();
                }).getPermissionRequests(false, null);
            }
        }

        function handleAdminCreatePermission() {
            $('#admin-permission-form')[0].reset();
            const userSelect = $('#form-permission-user').html('<option value="">Cargando...</option>');

            google.script.run.withSuccessHandler(function (users) {
                userSelect.empty().append('<option value="" disabled selected>Seleccione...</option>');
                users.forEach(function (u) {
                    if (u.estado === 'Activo') {
                        userSelect.append('<option value="' + u.userId + '">' + u.name + '</option>');
                    }
                });
                $('#adminPermissionModal').modal('show');
            }).getAllUsersForAdmin();
        }

        function handleAdminSavePermission(e) {
            e.preventDefault();
            const btn = $('#save-permission-btn');
            const originalText = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                userId: $('#form-permission-user').val(),
                startDate: $('#form-permission-start-date').val(),
                endDate: $('#form-permission-end-date').val(),
                type: $('#form-permission-type').val(),
                comments: $('#form-permission-comments').val()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(originalText);
                if (res.success) {
                    $('#adminPermissionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateAdminPermissionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(originalText);
                showNotification('Error', err.message, 'danger');
            }).adminCreatePermission(data);
        }

        function handleUpdatePermissionStatus(button, newStatus) {
            const permisoId = $(button).data('id');
            if (!confirm('¿Seguro que desea ' + newStatus.toLowerCase() + ' esta solicitud?')) return;

            const icon = $(button).html();
            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateAdminPermissionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(icon);
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                $(button).prop('disabled', false).html(icon);
            }).updatePermissionStatus(permisoId, newStatus);
        }

        function handleDeletePermission() {
            const permisoId = $(this).data('id');
            if (!confirm('¿Seguro de eliminar esta solicitud?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateAdminPermissionsTable();
                    populateUserPermissionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).deletePermissionRequest(permisoId);
        }

        // --- Reportes y Dashboard ---
        function populateTodaysAbsentees() {
            const listContainer = $('#absent-today-list');
            listContainer.html('<div class="list-group-item text-center"><div class="spinner-border spinner-border-sm"></div></div>');

            google.script.run.withSuccessHandler(function (absentees) {
                listContainer.empty();
                const count = (absentees && Array.isArray(absentees)) ? absentees.length : 0;
                $('#absent-count-badge').text(count > 0 ? count : '');
                if (!absentees || absentees.length === 0) {
                    listContainer.html('<div class="list-group-item list-group-item-success text-center"><i class="fas fa-check-circle"></i> No hay inasistencias.</div>');
                } else {
                    absentees.forEach(function (user) {
                        const cedulaDisplay = (user.cedula && user.cedula !== 'S/C') ? ' <span class="badge badge-light border ml-1">' + user.cedula + '</span>' : '';
                        listContainer.append('<div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3"><div><h6 class="mb-0 font-weight-bold text-dark" style="font-size:0.88rem;">' + user.name + cedulaDisplay + '</h6><small class="text-muted">' + (user.institucion || 'Sede Central') + ' &bull; Turno: ' + (user.turno || 'mañana') + '</small></div><span class="badge badge-danger">Inasistente</span></div>');
                    });
                }
            }).withFailureHandler(function (err) {
                listContainer.html('<div class="list-group-item list-group-item-danger">Error: ' + err.message + '</div>');
            }).getTodaysAbsentees();
        }

        function handleCompleteExport() {
            const startDate = $('#hours-filter-start-date').val();
            const endDate = $('#hours-filter-end-date').val();
            const button = $('#export-complete-report-btn');

            if (!startDate || !endDate) {
                alert('Selecciona un rango de fechas.');
                return;
            }

            const originalText = button.html();
            button.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Generando...');

            google.script.run.withSuccessHandler(function (reportData) {
                if (reportData.length === 0) {
                    alert('No se encontraron datos.');
                    button.prop('disabled', false).html(originalText);
                    return;
                }

                const tempTable = $('<table>').attr('id', 'tempExportTable').hide();
                $('body').append(tempTable);

                const dt = tempTable.DataTable({
                    data: reportData,
                    columns: [
                        { data: 'date', title: 'Fecha' },
                        { data: 'tipoDia', title: 'Tipo de Día' },
                        { data: 'horaEntrada', title: 'Entrada' },
                        { data: 'horaSalida', title: 'Salida' },
                        { data: 'name', title: 'Nombre' },
                        { data: 'institucion', title: 'Institución' },
                        { data: 'turno', title: 'Turno' },
                        { data: 'status', title: 'Estado' },
                        { data: 'comentarios', title: 'Comentarios' }
                    ],
                    dom: 'B',
                    buttons: [
                        { extend: 'excelHtml5', title: 'Reporte Completo (' + startDate + ' al ' + endDate + ')', text: 'Descargar' }
                    ]
                });

                dt.buttons(0).trigger();
                dt.destroy();
                tempTable.remove();
                button.prop('disabled', false).html(originalText);
            }).withFailureHandler(function (err) {
                alert('Error: ' + err.message);
                button.prop('disabled', false).html(originalText);
            }).getCompleteAttendanceReport(startDate, endDate);
        }

        function initHoursReportTable() {
            hoursReportTable = $('#hoursReportTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: 'name' },
                    { data: 'institucion', className: 'dt-center' },
                    { data: 'turno', className: 'dt-center' },
                    { data: 'daysWorked', className: 'dt-center text-success font-weight-bold' },
                    { data: 'absentDaysCount', className: 'dt-center text-danger font-weight-bold' },
                    { data: 'totalHours', className: 'dt-center' },
                    { data: null, className: 'dt-center', orderable: false, render: function () { return '<button class="btn btn-primary btn-sm view-detail-btn" data-toggle="modal" data-target="#detailedReportModal" title="Ver detalle"><i class="fas fa-eye"></i></button>'; } }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                dom: "<'row'<'col-sm-12'B>><'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
                buttons: [
                    { extend: "excelHtml5", text: '<i class="fas fa-file-excel"></i> Excel', className: "btn btn-success", exportOptions: { columns: [0, 1, 2, 3, 4, 5] } },
                    { extend: "pdfHtml5", text: '<i class="fas fa-file-pdf"></i> PDF', orientation: "landscape", className: "btn btn-danger", exportOptions: { columns: [0, 1, 2, 3, 4, 5] } }
                ]
            });

            const today = new Date();
            const oneMonthAgo = new Date(new Date().setMonth(today.getMonth() - 1));

            $('#hours-filter-start-date').val(oneMonthAgo.toISOString().split('T')[0]);
            $('#hours-filter-end-date').val(today.toISOString().split('T')[0]);
            populateHoursReportTable();
        }

        function populateHoursReportTable() {
            if (!hoursReportTable) return;
            const start = $('#hours-filter-start-date').val();
            const end = $('#hours-filter-end-date').val();

            if (!start && !end && cachedAdminData && cachedAdminData.hoursReport) {
                hoursReportTable.clear().rows.add(cachedAdminData.hoursReport).draw();
                return;
            }

            $('#hoursReportTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (d) {
                if (hoursReportTable) hoursReportTable.clear().rows.add(d).draw();
            }).calculateHoursWorkedReport(start, end);
        }

        function initDetailedReportTable() {
            detailedReportTable = $('#detailedReportTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: 'date', className: 'dt-center' },
                    { data: 'totalHours', className: 'dt-center' },
                    { data: 'entries' },
                    { data: 'exits' }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                dom: "Bfrtip",
                buttons: [
                    { extend: "excelHtml5", text: '<i class="fas fa-file-excel"></i> Exportar', className: "btn btn-success" }
                ]
            });
        }

        function populateDetailedReportTable() {
            if (!detailedReportTable || !currentDetailedUserId) return;

            const startDate = $('#detail-start-date').val();
            const endDate = $('#detail-end-date').val();

            if (!startDate || !endDate) {
                alert('Seleccione un rango de fechas.');
                return;
            }

            $('#detailedReportTable tbody').html('<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div></td></tr>');
            const absentList = $('#absent-dates-list').empty().html('<div class="list-group-item">Cargando...</div>');

            google.script.run.withSuccessHandler(function (reportData) {
                if (detailedReportTable) {
                    detailedReportTable.clear().rows.add(reportData.workedDays).draw();
                }
                absentList.empty();
                if (reportData.absentDates && reportData.absentDates.length > 0) {
                    reportData.absentDates.forEach(function (date) {
                        absentList.append('<div class="list-group-item">' + date + '</div>');
                    });
                } else {
                    absentList.append('<div class="list-group-item">No hay ausencias.</div>');
                }
            }).getDetailedHoursReport(currentDetailedUserId, startDate, endDate);
        }

        // ---- REGISTRO DIRECTO (SIN GPS) ----
        // GPS eliminado en v2.0 — El registro se realiza directamente tras el escaneo del QR.

        
        // ===============================================
        // === SEGURIDAD Y VALIDACIÓN DE DISPOSITIVO ÚNICO ==
        // ===============================================
        function getOrCreateDeviceIdentifier() {
            let deviceId = localStorage.getItem('asis_device_token');
            if (!deviceId) {
                if (window.crypto && window.crypto.randomUUID) {
                    deviceId = window.crypto.randomUUID();
                } else {
                    deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
                }
                localStorage.setItem('asis_device_token', deviceId);
            }
            return deviceId;
        }

        function getDeviceHardwareInfo() {
            const ua = navigator.userAgent || '';
            let model = 'Dispositivo Web';
            if (/android/i.test(ua)) {
                const m = ua.match(/Android\s+([0-9\.]+);\s+([a-zA-Z0-9\s_-]+)\s+Build/);
                model = m && m[2] ? `Android (${m[2].trim()})` : 'Móvil Android';
            } else if (/iphone|ipad|ipod/i.test(ua)) {
                model = 'Apple iOS (iPhone/iPad)';
            } else if (/windows/i.test(ua)) {
                model = 'Windows PC';
            } else if (/macintosh/i.test(ua)) {
                model = 'Mac OS';
            } else if (/linux/i.test(ua)) {
                model = 'Linux PC';
            }
            const screenRes = `${window.screen.width}x${window.screen.height}`;
            return `${model} [${screenRes}]`;
        }

        // ===============================================
        // === EXPORTADOR DE SÁBANA SEMANAL (EXCEL) ======
        // ===============================================
        function handleWeeklySabanaExport(scope) {
            let start = $('#filter-start-date').val() || $('#coord-filter-start-date').val();
            let end = $('#filter-end-date').val() || $('#coord-filter-end-date').val();

            if (!start) {
                const today = new Date();
                const day = today.getDay();
                const diff = day === 0 ? -6 : 1 - day;
                const mon = new Date(today);
                mon.setDate(today.getDate() + diff);
                start = mon.toISOString().split('T')[0];
            }
            if (!end) {
                const mon = new Date(start + 'T00:00:00');
                const sun = new Date(mon);
                sun.setDate(mon.getDate() + 6);
                end = sun.toISOString().split('T')[0];
            }

            const activeUser = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (window.currentUser || JSON.parse(sessionStorage.getItem('currentUser') || '{}'));
            const targetScope = scope || (activeUser.role === 'Admin' ? 'admin' : (activeUser.areas || []));
            const btn = $(scope === 'admin' ? '#btn-export-sabana-admin' : '#btn-export-sabana-coord');
            const origHtml = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Generando Sábana...');

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(origHtml);
                if (!res || !res.success) {
                    showNotification('Error', 'No se pudo generar la sábana: ' + (res ? res.error : 'Sin datos'), 'danger');
                    return;
                }
                renderAndDownloadWeeklySabana(res);
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(origHtml);
                showNotification('Error', 'Fallo de conexión al generar la sábana: ' + err.message, 'danger');
            }).getWeeklyAttendanceSabana(start, end, targetScope);
        }

        function renderAndDownloadWeeklySabana(res) {
            try {
                const meta = res.metadata;
                const days = meta.weekDays;
                const rows = res.filas;

                if (!rows || rows.length === 0) {
                    showNotification('Atención', 'No se encontraron operadores activos para la semana seleccionada.', 'warning');
                    return;
                }

                const aoa = [];
                aoa.push([meta.institucionSuperior || "MINISTERIO DEL PODER POPULAR PARA HÁBITAT Y VIVIENDA"]);
                aoa.push([meta.constructora || "CONSTRUCTORA DEL ALBA BOLIVARIANA"]);
                aoa.push([meta.titulo || "SÁBANA DE CONTROL DE ASISTENCIA SEMANAL — PERSONAL OPERATIVO"]);
                aoa.push([`SEMANA: Del ${meta.periodo.inicio} al ${meta.periodo.fin}  |  ESTADO DOMINGO: ${meta.domingoLaborable ? 'LABORABLE' : 'LIBRE'}  |  TOTAL OPERADORES: ${meta.totalOperadores}  |  BASE SEMANAL: ${meta.baseDias} DÍAS`]);
                aoa.push([]);

                // Fila 6: Encabezado 1
                const h1 = ["N°", "NOMBRES Y APELLIDOS", "CÉDULA"];
                days.forEach(d => {
                    h1.push(d.label);
                    h1.push("");
                });
                h1.push("TOTAL ASISTENCIA");
                h1.push("OBSERVACIONES");
                aoa.push(h1);

                // Fila 7: Sub-encabezado 2
                const h2 = ["", "", ""];
                days.forEach(d => {
                    h2.push("Entrada");
                    h2.push("Salida");
                });
                h2.push(`Base ${meta.baseDias}/${meta.baseDias}`);
                h2.push("");
                aoa.push(h2);

                // Filas de datos
                rows.forEach(r => {
                    const rowData = [r.num, r.nombreCompleto, r.cedula];
                    days.forEach(d => {
                        const dayInfo = r.dias[d.dateStr] || { entrada: '--', salida: '--' };
                        rowData.push(dayInfo.entrada);
                        rowData.push(dayInfo.salida);
                    });
                    rowData.push(r.totalAsistenciaStr);
                    rowData.push(r.observaciones || '');
                    aoa.push(rowData);
                });

                const ws = XLSX.utils.aoa_to_sheet(aoa);

                ws['!merges'] = [
                    { s: { r: 0, c: 0 }, e: { r: 0, c: 18 } },
                    { s: { r: 1, c: 0 }, e: { r: 1, c: 18 } },
                    { s: { r: 2, c: 0 }, e: { r: 2, c: 18 } },
                    { s: { r: 3, c: 0 }, e: { r: 3, c: 18 } },
                    { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },
                    { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
                    { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },
                    { s: { r: 5, c: 3 }, e: { r: 5, c: 4 } },
                    { s: { r: 5, c: 5 }, e: { r: 5, c: 6 } },
                    { s: { r: 5, c: 7 }, e: { r: 5, c: 8 } },
                    { s: { r: 5, c: 9 }, e: { r: 5, c: 10 } },
                    { s: { r: 5, c: 11 }, e: { r: 5, c: 12 } },
                    { s: { r: 5, c: 13 }, e: { r: 5, c: 14 } },
                    { s: { r: 5, c: 15 }, e: { r: 5, c: 16 } },
                    { s: { r: 5, c: 17 }, e: { r: 6, c: 17 } },
                    { s: { r: 5, c: 18 }, e: { r: 6, c: 18 } }
                ];

                ws['!cols'] = [
                    { wch: 5 }, { wch: 32 }, { wch: 14 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 10 }, { wch: 10 },
                    { wch: 11 }, { wch: 11 },
                    { wch: 18 },
                    { wch: 30 }
                ];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Sábana Semanal");

                const filename = `Sabana_Asistencia_${meta.periodo.inicio}_al_${meta.periodo.fin}.xlsx`;
                XLSX.writeFile(wb, filename);

                if (typeof playSuccessBeep === 'function') playSuccessBeep();
                showNotification('Éxito', `Sábana de asistencia semanal exportada correctamente: <strong>${filename}</strong>`, 'success');
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Fallo al exportar el archivo Excel: ' + err.message, 'danger');
            }
        }
        window.handleWeeklySabanaExport = handleWeeklySabanaExport;
        window.renderAndDownloadWeeklySabana = renderAndDownloadWeeklySabana;
    
        function processAttendanceDirect(type) {
            $("#action-buttons").hide();
            $("#scan-spinner").show();
            google.script.run
                .withSuccessHandler(onRecordSuccess)
                .withFailureHandler(onRecordFailure)
                .recordAttendance({
                    userId: currentUser.userId,
                    name: currentUser.name,
                    type: type,
                    deviceId: getOrCreateDeviceIdentifier(),
                    deviceInfo: getDeviceHardwareInfo()
                });
        }

        function processModalAttendanceDirect(type) {
            $("#modal-action-buttons").hide();
            $("#modal-scan-spinner").show();
            google.script.run
                .withSuccessHandler(onModalRecordSuccess)
                .withFailureHandler(onModalRecordFailure)
                .recordAttendance({
                    userId: currentUser.userId,
                    name: currentUser.name,
                    type: type,
                    deviceId: getOrCreateDeviceIdentifier(),
                    deviceInfo: getDeviceHardwareInfo()
                });
        }

        // ---- GUÍA VISUAL DE ERRORES DE CÁMARA ----
        function showCameraErrorGuide() {
            const isInAppBrowser = /FBAN|FBAV|Instagram|Line|WhatsApp/i.test(navigator.userAgent);
            let title = "Error de Cámara";
            let message;
            if (isInAppBrowser) {
                message = "Está usando un navegador interno (Facebook, Instagram, WhatsApp). " +
                    "Por favor, abra este enlace directamente en Chrome o Safari.";
            } else {
                message = "No se pudo acceder a la cámara. Verifique: 1) Que haya concedido el permiso de cámara en el navegador. " +
                    "2) Que no haya otra app usando la cámara. 3) Cierre y abra el navegador. " +
                    "4) Si persiste, solicite un Registro Manual.";
            }
            showNotification(title, message, "error");
        }

        // ---- FEEDBACK AUDITIVO (BEAP QR) ----
        function playSuccessBeep() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.type = "sine";
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            } catch (e) { }
        }

        // ---- MANEJO UNIFICADO DE ESCANEO QR Y RESULTADO ----
        function handleQRScanResult(qrString, type, isModal) {
            try {
                let d = JSON.parse(qrString);
                if (d.id && d.id === masterQRId) {
                    playSuccessBeep();
                    if (isModal) {
                        stopModalScanner();
                        processModalAttendanceDirect(type);
                    } else {
                        stopScanner();
                        processAttendanceDirect(type);
                    }
                } else {
                    const msg = "QR no reconocido. Asegúrese de escanear el código oficial de la sede.";
                    if (isModal) {
                        $("#modal-scan-spinner").hide();
                        showNotification("QR no válido", msg, "warning");
                    } else {
                        $("#scan-spinner").hide();
                        showNotification("QR no válido", msg, "warning");
                    }
                }
            } catch (e) {
                const msg = "El código leído no es válido o está incompleto. Intente nuevamente.";
                if (isModal) {
                    $("#modal-scan-spinner").hide();
                    showNotification("Error de formato", msg, "warning");
                } else {
                    $("#scan-spinner").hide();
                    showNotification("Error de formato", msg, "warning");
                }
            }
        }



        // --- Lógica de App Base ---
        function logout() {
            stopScanner();
            currentUser = null; window.currentUser = null;
            sessionStorage.removeItem("currentUser");
            const tables = ['adminAttendanceTable', 'userAttendanceTable', 'usersTable', 'dutiesTable', 'hoursReportTable', 'detailedReportTable', 'adminPermissionsTable', 'userPermissionsTable', 'substitutionsTable', 'crossTable'];
            tables.forEach(function (id) {
                if ($.fn.DataTable.isDataTable('#' + id)) {
                    $('#' + id).DataTable().destroy();
                }
            });
            loadLoginPage();
        }

        function handleAdminManualRecord(button, type) {
            const userName = $(button).data('user-name');
            const userId = $(button).data('user-id');
            const originalIcon = $(button).html();

            if (!confirm('¿Registrar ' + type + ' de ' + userName + '?')) return;

            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (response) {
                $(button).prop('disabled', false).html(originalIcon);
                if (response.success) {
                    showNotification('Éxito', response.message, 'success');
                    if (cachedAdminData) {
                        cachedAdminData.attendance = null;
                        cachedAdminData.stats = null;
                        cachedAdminData.openSessions = null;
                        cachedAdminData.absentees = null;
                    }
                    populateAdminAttendanceTable();
                    populateTodaysAbsentees();
                    populateOpenSessions();
                    updateAdminView();
                } else {
                    showNotification('Denegado', response.message, 'warning');
                }
            }).withFailureHandler(function (error) {
                $(button).prop('disabled', false).html(originalIcon);
                showNotification('Error', error.message, 'danger');
            }).adminRecordAttendance({ userId: userId, name: userName, type: type });
        }

        function updateAdminView() {
            if (adminTable) adminTable.draw();
            const s = '<div class="spinner-border spinner-border-sm"></div>';
            $('#stats-total-checks, #stats-outside-range, #stats-total-users, #stats-today-checks').html(s);

            google.script.run.withSuccessHandler(function (stats) {
                $('#stats-total-users').text(stats.totalUsers);
                $('#stats-today-checks').text(stats.todayChecks);
                $('#stats-total-checks').text(stats.totalChecks);
                $('#stats-outside-range').text(stats.outsideRangeChecks);
            }).getAdminDashboardStats($('#filter-start-date').val(), $('#filter-end-date').val());
        }

        function initAdminAttendanceTable() {
            adminTable = $('#adminAttendanceTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: "timestamp", className: "dt-center" },
                    { data: "name" },
                    { data: "institucion" },
                    { data: "turno" },
                    { data: "type", className: "dt-center", render: function (d) { return '<span class="badge badge-pill badge-' + (d === "Entrada" ? "success" : "danger") + '">' + d + '</span>'; } },
                    {
                        data: "status", className: "dt-center", render: function (d) {
                            let b = 'primary';
                            if (d === 'Fuera de Rango') b = 'warning';
                            if (d === 'Registro Manual' || d === 'Cierre Manual') b = 'info';
                            if (d === 'Cierre Automático') b = 'secondary';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    { data: "distance", className: "dt-center" }
                ],
                order: [[0, "desc"]],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                dom: "<'row'<'col-sm-12'B>><'row'<'col-sm-12 col-md-6'l><'col-sm-12 col-md-6'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-12 col-md-5'i><'col-sm-12 col-md-7'p>>",
                buttons: [
                    { extend: "excelHtml5", text: '<i class="fas fa-file-excel"></i> Excel', className: "btn btn-success" },
                    { extend: "pdfHtml5", text: '<i class="fas fa-file-pdf"></i> PDF', orientation: "landscape", className: "btn btn-danger" },
                    { extend: "print", text: '<i class="fas fa-print"></i> Imprimir', className: "btn btn-info" }
                ]
            });
            populateAdminAttendanceTable();
        }

        function populateAdminAttendanceTable() {
            const startDate = $('#filter-start-date').val();
            const endDate = $('#filter-end-date').val();

            if (adminTable) {
                adminTable.clear().draw();
            }

            if (cachedAdminData && cachedAdminData.attendance) {
                if (adminTable) {
                    adminTable.clear().rows.add(cachedAdminData.attendance).draw();
                }
                return;
            }

            if (adminTable) {
                $('#adminAttendanceTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando registros...</td></tr>');
            }

            google.script.run.withSuccessHandler(function (r) {
                if (adminTable) {
                    $('#adminAttendanceTable tbody').empty();
                    adminTable.clear().rows.add(r).draw();
                }
            }).getAttendanceRecords('admin', startDate, endDate);
        }

        function showNotification(t, m, c = "info") {
            $("#notificationModalHeader").removeClass("bg-success bg-danger bg-warning bg-info").addClass("bg-" + c);
            $("#notificationModalLabel").text(t);
            $("#notificationModalBody").html(m);
            $("#notificationModal").modal("show");
        }
        window.showNotification = showNotification;

        function loadView(f, c) {
            document.body.classList.add("bg-gradient-primary");
            $("#app-container").html('<div class="spinner-container"><div class="spinner-border text-light" style="width: 5rem; height: 5rem;"></div></div>');

            google.script.run.withSuccessHandler(function (h) {
                document.body.classList.remove("bg-gradient-primary");
                $("#app-container").html(h);
                if (c) c();
            }).withFailureHandler(function (e) {
                showNotification("Error Crítico", "No se pudo cargar la página: " + e.message, "error");
            }).include(f);
        }

        function handleLogin(e) {
            e.preventDefault();
            $("#login-spinner").show();
            $("#login-error").hide();

            google.script.run.withSuccessHandler(function (u) {
                if (!u) {
                    $("#login-spinner").hide();
                    $("#login-error").text("Correo o contraseña incorrectos.").show();
                    return;
                }
                if (u.inactive) {
                    $("#login-spinner").hide();
                    $("#login-error").text("Su usuario se encuentra inactivo. Comuníquese con el administrador.").show();
                    return;
                }
                currentUser = u; window.currentUser = u;
                sessionStorage.setItem("currentUser", JSON.stringify(u));
                masterQRId = u.masterQRId || "QR-MAESTRO-ASISTENCIA-V1";
                routeByRole(u);
            }).withFailureHandler(function () {
                $("#login-spinner").hide();
                $("#login-error").text("Error de conexión.").show();
            }).userLogin($("#email").val(), $("#password").val());
        }

        // ---- ROUTING POR ROL ----
        // Función de normalización para comparaciones de SubRol tolerantes a acentos y mayúsculas
        function normalizeSubRol(subRol) {
            return String(subRol || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
        }

        function hasPermission(modulo, accion) {
            if (!currentUser) return false;
            const subRolNorm = normalizeSubRol(currentUser.subRol);
            if (subRolNorm === 'superadmin') return true; // Superadmin total control

            let rules = [];
            if (cachedAdminData && cachedAdminData.accessRules) {
                rules = cachedAdminData.accessRules;
            } else if (cachedCoordinatorData && cachedCoordinatorData.accessRules) {
                rules = cachedCoordinatorData.accessRules;
            } else if (cachedUserData && cachedUserData.accessRules) {
                rules = cachedUserData.accessRules;
            }

            const rule = rules.find(r =>
                normalizeSubRol(r.subRol) === subRolNorm &&
                String(r.modulo).toLowerCase() === String(modulo).toLowerCase() &&
                String(r.accion).toLowerCase() === String(accion).toLowerCase()
            );

            if (rule) {
                return rule.permitido;
            }

            // Fallbacks
            if (subRolNorm === 'coordinador general') {
                const restricted = ['audit', 'access-rules', 'reports'];
                return !restricted.includes(accion.toLowerCase());
            }
            if (subRolNorm === 'coordinador de area') {
                return true;
            }
            if (subRolNorm === 'operador/a') {
                const allowed = ['asistencia', 'user-warnings'];
                return allowed.includes(accion.toLowerCase());
            }
            if (subRolNorm === 'analista' || subRolNorm === 'informatico/a') {
                return true;
            }
            return false;
        }

        function routeByRole(u) {
            const subRolNorm = normalizeSubRol(u.subRol);
            if (subRolNorm === 'coordinador general' || subRolNorm === 'superadmin') {
                loadAdminDashboard();
            } else if (subRolNorm === 'coordinador de area') {
                loadCoordinadorDashboard();
            } else {
                loadUserDashboard();
            }
        }

        function loadLoginPage() {
            loadView("LoginPage.html", function () {
                $("#login-form").on("submit", handleLogin);
            });
        }

        function generateMasterQRCode() {
            const c = document.getElementById("master-qrcode-container");
            const s = $("#master-qrcode-spinner");
            c.innerHTML = "";
            new QRCode(c, { text: JSON.stringify({ id: masterQRId }), width: 200, height: 200 });
            s.hide();
        }

        // ===============================================
        // ============= VISTA DE USUARIO ================
        // ===============================================
        function loadUserDashboard() {
            loadView("UserDashboard.html", () => {
                // Display user name, role and areas
                $("#user-name-display").text(currentUser.name);

                // Set header panel title based on sub-role
                if (currentUser.subRol === 'Analista' || currentUser.subRol === 'Informático/a') {
                    $('#panel-title-header').text('Panel de ' + currentUser.subRol);
                } else {
                    $('#panel-title-header').text('Panel de Operador');
                }

                $('#user-badge-container').html('<span class="badge badge-primary px-3 py-2"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando...</span>');
                $('#logout-button').on('click', logout);

                if (currentUser.foto && currentUser.foto !== "") {
                    $('.img-profile').attr('src', getSafeDriveImageUrl(currentUser.foto));
                }

                $('#userAttendanceTable tbody').html('<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');

                google.script.run.withFailureHandler(function (err) {
                    showNotification("Error", "Error de conexión o autorización: " + (err ? err.message : "Desconocido"), "danger");
                }).withSuccessHandler(function (data) {
                    if (!data || data.error) {
                        const errorMsg = (data && data.error) ? data.error : "Conflicto de permisos o sesión expirada. Si tienes varias cuentas de Google abiertas en este navegador, por favor abre la aplicación en una ventana de incógnito.";
                        showNotification("Error", "Error al cargar datos del panel: " + errorMsg, "danger");
                        return;
                    }
                    cachedUserData = data;

                    // Aplicar restricciones de pestañas según permisos dinámicos y sub-rol
                    const tabsUser = [
                        { id: '#asistencia-tab', action: 'asistencia' },
                        { id: '#permisos-tab', action: 'permisos' },
                        { id: '#suplencias-tab', action: 'suplencias' },
                        { id: '#cross-tab', action: 'crossturno' },
                        { id: '#user-warnings-tab', action: 'user-warnings' },
                        { id: '#horarios-tab', action: 'horarios' }
                    ];

                    let firstVisibleTab = null;
                    tabsUser.forEach(tab => {
                        if (hasPermission('UserDashboard', tab.action)) {
                            $(tab.id).closest('li').show();
                            if (!firstVisibleTab) firstVisibleTab = tab.id;
                        } else {
                            $(tab.id).closest('li').hide();
                        }
                    });

                    if (firstVisibleTab && !$(firstVisibleTab).hasClass('active')) {
                        $(firstVisibleTab).tab('show');
                    }

                    // Load areas and populate badge
                    if (currentUser.areas && currentUser.areas.length > 0 && data.areasConfig) {
                        const myAreaNames = data.areasConfig.filter(a => currentUser.areas.indexOf(a.areaId) !== -1).map(a => a.nombreArea);
                        const label = myAreaNames.length > 0 ? myAreaNames.join(', ') : currentUser.areas.join(', ');
                        $('#user-badge-container').html('<span class="badge badge-primary px-3 py-2"><i class="fas fa-user-tag mr-1"></i> ' + currentUser.subRol + ' — <i class="fas fa-sitemap mr-1"></i> ' + label + '</span>');
                    } else {
                        $('#user-badge-container').html('<span class="badge badge-primary px-3 py-2"><i class="fas fa-user-tag mr-1"></i> ' + currentUser.subRol + ' — <i class="fas fa-sitemap mr-1"></i> Sin Área</span>');
                    }

                    $("#refresh-table-button").on("click", function () {
                        cachedUserData.attendance = null;
                        populateUserTable();
                    });
                    $("#scan-check-in").off("click").on("click", () => startScanner("Entrada"));
                    $("#scan-check-out").off("click").on("click", () => startScanner("Salida"));
                    $("#stop-scan-button").off("click").on("click", stopScanner);


                    $("#user-request-manual-check-btn").on("click", function () {
                        $("#manual-check-request-form")[0].reset();
                        $("#requestManualCheckModal").modal("show");
                    });

                    $("#manual-check-request-form").on("submit", function (e) {
                        e.preventDefault();
                        const type = $("#manual-check-type").val();
                        const reason = $("#manual-check-reason").val();

                        if (!type || !reason) {
                            showNotification("Atención", "Por favor complete todos los campos.", "warning");
                            return;
                        }

                        const submitBtn = $("#submit-manual-check-btn");
                        const originalHtml = submitBtn.html();
                        submitBtn.prop("disabled", true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Enviando...');

                        google.script.run.withSuccessHandler(function (res) {
                            submitBtn.prop("disabled", false).html(originalHtml);
                            if (res.success) {
                                showNotification("Éxito", res.message, "success");
                                $("#requestManualCheckModal").modal("hide");
                            } else {
                                showNotification("Error", res.message, "danger");
                            }
                        }).withFailureHandler(function (err) {
                            submitBtn.prop("disabled", false).html(originalHtml);
                            showNotification("Error", "Error al enviar solicitud: " + err.message, "danger");
                        }).submitManualCheckRequest({
                            userId: currentUser.userId,
                            type: type,
                            reason: reason
                        });
                    });

                    $('#request-permission-form').on('submit', handleRequestPermission);
                    $('#userPermissionsTable tbody').on('click', '.delete-permission-btn', handleDeletePermission);

                    $('#create-substitution-form').on('submit', handleCreateSubstitution);
                    $('#refresh-market-btn').on('click', function () {
                        cachedUserData.marketRequests = null;
                        populateMarketTable();
                    });
                    $('#market-table tbody').on('click', '.accept-market-btn', handleAcceptMarketRequest);

                    $('#refresh-substitutions-btn').on('click', function () {
                        cachedUserData.substitutionInfo = null;
                        populateUserSubstitutionPanels();
                    });
                    $('#pending-approval-list').on('click', '.approve-by-titular-btn', handleApproveByTitular);
                    $('#pending-approval-list').on('click', '.reject-by-titular-btn', handleRejectByTitular);

                    $('#create-cross-user-form').on('submit', handleRequestCrossUser);
                    $('#refresh-user-cross-btn').on('click', function () {
                        cachedUserData.crossTurnos = null;
                        populateUserCrossList();
                    });

                    // --- Listeners de Horarios ---
                    $('#refresh-sched-history-btn').on('click', function () {
                        cachedUserData.schedulesHistory = null;
                        populateUserSchedulesTable();
                    });
                    $('#add-sched-slot-btn').on('click', handleAddSchedSlot);
                    $('#sched-slots-temp-table').on('click', '.remove-slot-btn', handleRemoveSchedSlot);
                    $('#upload-schedule-form').on('submit', handleUploadSchedule);
                    $('#sched-image-file').on('change', function (e) {
                        const file = e.target.files[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = function (event) {
                                $('#sched-img-preview').attr('src', event.target.result);
                                $('#sched-img-preview-container').show();
                            };
                            reader.readAsDataURL(file);
                            $(this).next('.custom-file-label').html(file.name);
                        } else {
                            $('#sched-img-preview-container').hide();
                            $(this).next('.custom-file-label').html('Seleccionar imagen...');
                        }
                    });

                    initUserTable();
                    initUserPermissionsTable();
                    populateCandidatesDropdown();
                    populateMarketTable();
                    populateUserSubstitutionPanels();
                    populateUserCrossList();

                    // --- Listeners de Amonestaciones (Usuario) ---
                    $('#user-refresh-warnings-btn').on('click', function () {
                        cachedUserData.warnings = null;
                        populateUserWarningsTable();
                    });
                    initUserWarningsTable();
                    initUserSchedulesTable();

                    updateUIBasedOnState(data.lastState);
                }).getUserDashboardData(currentUser.userId);
            });
        }

        function updateUIBasedOnState(s) {
            let i = $("#scan-check-in"), o = $("#scan-check-out"), d = $("#user-status-display");
            if (s && "Entrada" === s.type) {
                d.html('Estado: <span class="text-success font-weight-bold">DENTRO</span>');
                $('#user-attendance-state-badge').html('<span class="badge badge-success px-2 py-1"><i class="fas fa-sign-in-alt mr-1"></i>DENTRO</span>');
                i.prop("disabled", true);
                o.prop("disabled", false);
            } else {
                d.html('Estado: <span class="text-danger font-weight-bold">FUERA</span>');
                $('#user-attendance-state-badge').html('<span class="badge badge-secondary px-2 py-1"><i class="fas fa-sign-out-alt mr-1"></i>FUERA</span>');
                i.prop("disabled", false);
                o.prop("disabled", true);
            }
        }

        function initUserTable() {
            userTable = $("#userAttendanceTable").DataTable({
                data: [],
                columns: [
                    { data: "timestamp" },
                    { data: "type", render: function (t) { return '<span class="badge badge-pill badge-' + (t === "Entrada" ? "success" : "danger") + '">' + t + '</span>'; } },
                    { data: "status", render: function (t) { return '<span class="badge badge-' + (t === "Correcto" ? "primary" : "warning") + '">' + t + '</span>'; } },
                    { data: "distance" }
                ],
                order: [[0, "desc"]],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateUserTable();
        }

        function populateUserTable() {
            if (!userTable) return;
            if (cachedUserData && cachedUserData.attendance) {
                userTable.clear().rows.add(cachedUserData.attendance).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (r) {
                if (cachedUserData) cachedUserData.attendance = r;
                if (userTable) {
                    userTable.clear().rows.add(r).draw();
                }
            }).getAttendanceRecords(currentUser.userId);
        }

        function startScanner(type) {
            activeScanType = type;
            $("#action-buttons").hide();
            $("#qr-scanner-container, #stop-scan-button").show();

            if (html5QrCode) {
                try {
                    if (html5QrCode.isScanning) {
                        html5QrCode.stop().catch(function () { });
                    }
                    html5QrCode.clear();
                } catch (e) { }
                html5QrCode = null;
            }

            try {
                html5QrCode = new Html5Qrcode("qr-reader");
                html5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 250, height: 250 } },
                    function (qr) {
                        stopScanner();
                        try {
                            let d = JSON.parse(qr);
                            if (d.id && d.id === masterQRId) {
                                playSuccessBeep();
                                processAttendanceDirect(type);
                            } else {
                                $("#scan-spinner").show();
                                onRecordFailure({ message: "QR no reconocido. Asegúrese de escanear el código oficial de la sede." });
                            }
                        } catch (e) {
                            $("#scan-spinner").show();
                            onRecordFailure({ message: "Error al leer QR: formato no válido." });
                        }
                    }
                ).catch(function (err) {
                    console.error("Error al iniciar cámara:", err);
                    showNotification("Error de Cámara", "No se pudo acceder a la cámara. Asegúrese de conceder los permisos en el navegador.", "error");
                    stopScanner();
                });
            } catch (err) {
                console.error("Error al instanciar Html5Qrcode:", err);
                showNotification("Error de Cámara", "Error al iniciar el escáner.", "error");
                stopScanner();
            }
        }

        // processGeolocation() eliminada en v2.0 — GPS ya no es requerido.

        function stopScanner() {
            if (html5QrCode) {
                if (html5QrCode.isScanning) {
                    html5QrCode.stop().then(function () {
                        try { html5QrCode.clear(); } catch (e) { }
                        html5QrCode = null;
                    }).catch(function (err) {
                        console.error("Error al detener scanner:", err);
                        try { html5QrCode.clear(); } catch (e) { }
                        html5QrCode = null;
                    });
                } else {
                    try { html5QrCode.clear(); } catch (e) { }
                    html5QrCode = null;
                }
            }
            $("#qr-scanner-container, #stop-scan-button, #scan-spinner").hide();
            $("#action-buttons").show();
            activeScanType = null;
        }

        function onRecordSuccess(r) {
            $("#scan-spinner").hide();
            $("#action-buttons").show();
            if (r.success) {
                if (navigator.vibrate) navigator.vibrate(200);
                showNotification("Éxito", r.message, "success");
                if (cachedUserData) {
                    cachedUserData.attendance = null;
                }
                populateUserTable();
                google.script.run.withSuccessHandler(updateUIBasedOnState).getLastAttendanceState(currentUser.userId);
            } else {
                showNotification("Denegado", r.message, "warning");
            }
        }

        function onRecordFailure(e) {
            $("#scan-spinner").hide();
            $("#action-buttons").show();
            showNotification("Error", "No se pudo procesar: " + (e.message || "Desconocido"), "error");
        }

        function initUserPermissionsTable() {
            userPermissionsTable = $('#userPermissionsTable').DataTable({
                data: [],
                columns: [
                    { data: null, render: function (r) { return r.fechaInicio + ' al ' + r.fechaFin; } },
                    { data: 'tipoPermiso' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Aprobado') b = 'success';
                            if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return (r.estado === 'Pendiente') ? '<button class="btn btn-danger btn-sm delete-permission-btn" title="Cancelar" data-id="' + r.permisoId + '"><i class="fas fa-trash"></i></button>' : '';
                        }
                    }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                searching: false,
                lengthChange: false,
                pageLength: 5,
                info: false
            });
            populateUserPermissionsTable();
        }

        function populateUserPermissionsTable() {
            if (userPermissionsTable) {
                if (cachedUserData && cachedUserData.permissions) {
                    userPermissionsTable.clear().rows.add(cachedUserData.permissions).draw();
                    return;
                }
                google.script.run.withSuccessHandler(function (d) {
                    if (cachedUserData) cachedUserData.permissions = d;
                    userPermissionsTable.clear().rows.add(d).draw();
                }).getPermissionRequests(true, currentUser.userId);
            }
        }

        function handleRequestPermission(e) {
            e.preventDefault();
            const btn = $('#submit-permission-request-btn');
            const originalText = btn.html();

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enviando...');

            const data = {
                userId: currentUser.userId,
                name: currentUser.name,
                startDate: $('#req-perm-start-date').val(),
                endDate: $('#req-perm-end-date').val(),
                type: $('#req-perm-type').val(),
                comments: $('#req-perm-comments').val()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(originalText);
                if (res.success) {
                    $('#request-permission-form')[0].reset();
                    showNotification('Éxito', res.message, 'success');
                    populateUserPermissionsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(originalText);
                showNotification('Error', err.message, 'danger');
            }).requestPermissionForUser(data);
        }

        function populateCandidatesDropdown() {
            const subSelect = $('#sub-candidate');
            const crossSelect = $('#user-cross-partner');

            subSelect.find('option:not(:first)').remove();
            crossSelect.find('option:not(:first)').remove();

            function render(users) {
                users.forEach(function (u) {
                    if (u.userId !== currentUser.userId && u.role !== 'Admin' && u.estado === 'Activo') {
                        const opt = '<option value="' + u.userId + '">' + u.name + ' (Turno: ' + u.turno + ')</option>';
                        subSelect.append(opt);
                        crossSelect.append(opt);
                    }
                });
            }
            if (cachedUserData && cachedUserData.users) {
                render(cachedUserData.users);
                return;
            }
            google.script.run.withSuccessHandler(render).getAllUsersForAdmin();
        }

        function handleCreateSubstitution(e) {
            e.preventDefault();
            const btn = $(this).find('button[type="submit"]');
            const originalText = btn.html();

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enviando...');

            const data = {
                titularId: currentUser.userId,
                suplenteId: $('#sub-candidate').val(),
                startDate: $('#sub-start-date').val(),
                endDate: $('#sub-end-date').val(),
                comentarios: $('#sub-comments').val()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(originalText);
                if (res.success) {
                    $('#create-substitution-form')[0].reset();
                    showNotification('Éxito', res.message, 'success');
                    populateUserSubstitutionPanels();
                    populateMarketTable();
                } else {
                    showNotification('Atención', res.message, 'warning');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(originalText);
                showNotification('Error', err.message, 'danger');
            }).createSubstitution(data);
        }

        function handleRequestCrossUser(e) {
            e.preventDefault();
            const btn = $('#submit-cross-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                userId: currentUser.userId,
                partnerId: $('#user-cross-partner').val(),
                dateStr: $('#user-cross-date').val()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    $('#create-cross-user-form')[0].reset();
                    populateUserCrossList();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).requestCrossTurnoUser(data);
        }

        function populateUserCrossList() {
            const tbody = $('#user-cross-list');
            tbody.html('<tr><td colspan="3" class="text-center"><div class="spinner-border spinner-border-sm"></div></td></tr>');

            function render(list) {
                tbody.empty();
                const myCrosses = list.filter(function (c) {
                    return c.u1Name === currentUser.name || c.u2Name === currentUser.name;
                });

                if (myCrosses.length === 0) {
                    tbody.html('<tr><td colspan="3" class="text-muted small">No tienes solicitudes de Cross.</td></tr>');
                    return;
                }

                myCrosses.forEach(function (c) {
                    const partner = (c.u1Name === currentUser.name) ? c.u2Name + ' (' + c.u2Turno + ')' : c.u1Name + ' (' + c.u1Turno + ')';
                    let badge = 'secondary';
                    if (c.estado === 'Aprobada') badge = 'success';
                    else if (c.estado.includes('Pendiente')) badge = 'warning';
                    else if (c.estado === 'Rechazada') badge = 'danger';

                    tbody.append(
                        '<tr>' +
                        '<td class="small">' + c.date + '</td>' +
                        '<td class="small">' + partner + '</td>' +
                        '<td><span class="badge badge-' + badge + '">' + c.estado + '</span></td>' +
                        '</tr>'
                    );
                });
            }
            if (cachedUserData && cachedUserData.crossTurnos) {
                render(cachedUserData.crossTurnos);
                return;
            }
            google.script.run.withSuccessHandler(render).getCrossTurnosList();
        }

        function populateMarketTable() {
            const tbody = $('#market-list-body');
            tbody.html('<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');

            function render(requests) {
                tbody.empty();
                if (requests.length === 0) {
                    tbody.html('<tr><td colspan="4" class="text-center text-muted small">No hay guardias disponibles en este momento.</td></tr>');
                    return;
                }
                requests.forEach(function (req) {
                    if (req.solicitante === currentUser.name) return;
                    const rowHtml = '<tr>' +
                        '<td class="small">' + req.fechaInicio + '</td>' +
                        '<td class="small font-weight-bold">' + req.turno + '</td>' +
                        '<td class="small">' + req.solicitante + '</td>' +
                        '<td class="text-center"><button class="btn btn-success btn-sm accept-market-btn" data-id="' + req.idSolicitud + '" title="Cubrir turno"><i class="fas fa-check"></i></button></td>' +
                        '</tr>';
                    tbody.append(rowHtml);
                });
                if (tbody.children().length === 0) {
                    tbody.html('<tr><td colspan="4" class="text-center text-muted small">No hay guardias disponibles.</td></tr>');
                }
            }
            if (cachedUserData && cachedUserData.marketRequests) {
                render(cachedUserData.marketRequests);
                return;
            }
            google.script.run.withSuccessHandler(render).withFailureHandler(function (err) {
                tbody.html('<tr><td colspan="4" class="text-danger small">Error: ' + err.message + '</td></tr>');
            }).getOpenRequests();
        }

        function handleAcceptMarketRequest() {
            const reqId = $(this).data('id');
            if (!confirm("¿Estás seguro de que quieres cubrir esta guardia?")) return;

            const btn = $(this);
            const original = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('¡Guardia Asignada!', res.message, 'success');
                    populateMarketTable();
                    populateUserSubstitutionPanels();
                } else {
                    showNotification('Error', res.message, 'danger');
                    btn.prop('disabled', false).html(original);
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                btn.prop('disabled', false).html(original);
            }).acceptRequest(reqId, currentUser.userId);
        }

        function populateUserSubstitutionPanels() {
            const spinner = '<div class="list-group-item text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</div>';
            $('#pending-approval-list, #iam-covering-list, #iam-being-covered-list').html(spinner);

            function render(data) {
                renderPendingApprovalList(data.pendingMyApproval);
                renderIAmCoveringList(data.iAmCovering);
                renderIAmBeingCoveredList(data.iAmBeingCovered);
            }
            if (cachedUserData && cachedUserData.substitutionInfo) {
                render(cachedUserData.substitutionInfo);
                return;
            }
            google.script.run.withSuccessHandler(render).withFailureHandler(function (err) {
                const errorMsg = '<div class="list-group-item text-danger">Error al cargar: ' + err.message + '</div>';
                $('#pending-approval-list, #iam-covering-list, #iam-being-covered-list').html(errorMsg);
            }).getUserSubstitutionInfo(currentUser.userId);
        }

        function renderPendingApprovalList(subs) {
            const list = $('#pending-approval-list').empty();
            if (subs.length === 0) {
                list.html('<div class="list-group-item text-muted">No tienes solicitudes pendientes de aprobar.</div>');
                return;
            }
            subs.forEach(function (s) {
                const timeInfo = (s.startTime && s.endTime) ? 'de ' + s.startTime + ' a ' + s.endTime : 'Día completo';
                const itemHtml = '<div class="list-group-item">' +
                    '<div class="d-flex w-100 justify-content-between">' +
                    '<h5 class="mb-1">Suplente: ' + s.suplenteName + '</h5>' +
                    '<small>' + s.startDate + ' al ' + s.endDate + '</small>' +
                    '</div>' +
                    '<p class="mb-1">Solicita cubrirte: ' + timeInfo + '.</p>' +
                    '<div class="text-right mt-2">' +
                    '<button class="btn btn-success btn-sm approve-by-titular-btn" data-id="' + s.subId + '"><i class="fas fa-check"></i> Aprobar</button> ' +
                    '<button class="btn btn-danger btn-sm reject-by-titular-btn" data-id="' + s.subId + '"><i class="fas fa-times"></i> Rechazar</button>' +
                    '</div></div>';
                list.append(itemHtml);
            });
        }

        function renderGenericSubList(containerId, subs, message, isCovering) {
            const list = $('#' + containerId).empty();
            if (subs.length === 0) {
                list.html('<div class="list-group-item text-muted">' + message + '</div>');
                return;
            }
            subs.forEach(function (s) {
                const otherPerson = isCovering ? 'Titular: ' + s.titularName : 'Suplente: ' + s.suplenteName;
                const timeInfo = (s.startTime && s.endTime) ? 'de ' + s.startTime + ' a ' + s.endTime : 'Día completo';
                const itemHtml = '<div class="list-group-item list-group-item-action">' +
                    '<div class="d-flex w-100 justify-content-between">' +
                    '<h5 class="mb-1 text-primary">' + otherPerson + '</h5>' +
                    '<small>' + s.startDate + ' al ' + s.endDate + '</small>' +
                    '</div>' +
                    '<p class="mb-1">Rango: ' + timeInfo + '. <br><small class="text-muted">Estado: ' + s.estado + '</small></p>' +
                    '</div>';
                list.append(itemHtml);
            });
        }

        function renderIAmCoveringList(subs) {
            renderGenericSubList('iam-covering-list', subs, 'No tienes ninguna suplencia activa para cubrir.', true);
        }
        function renderIAmBeingCoveredList(subs) {
            renderGenericSubList('iam-being-covered-list', subs, 'Ninguno de tus turnos está siendo cubierto actualmente.', false);
        }

        function handleApproveByTitular() {
            const subId = $(this).data('id');
            if (!confirm('¿Aprobar esta solicitud? Pasará a la validación del administrador.')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateUserSubstitutionPanels();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).approveSubstitutionByTitular(subId, currentUser.userId);
        }

        function handleRejectByTitular() {
            const subId = $(this).data('id');
            if (!confirm('¿Rechazar esta solicitud de suplencia?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', 'La solicitud ha sido rechazada.', 'success');
                    populateUserSubstitutionPanels();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).updateSubstitutionStatus(subId, 'Rechazada', currentUser.userId);
        }

        // =======================================================
        // ============= GESTIÓN DE ÁREAS (ADMIN) ================
        // =======================================================
        let areasTable = null;

        function initAreasTable() {
            areasTable = $('#areasTable').DataTable({
                data: [],
                columns: [
                    { data: 'areaId' },
                    { data: 'nombreArea' },
                    { data: 'creadoPor' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return '<button class="btn btn-warning btn-sm rename-area-btn mr-1" data-id="' + r.areaId + '" data-name="' + r.nombreArea + '" title="Renombrar"><i class="fas fa-edit"></i></button>' +
                                '<button class="btn btn-danger btn-sm delete-area-btn" data-id="' + r.areaId + '" title="Desactivar"><i class="fas fa-trash-alt"></i></button>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAreasTable();
        }

        function populateAreasTable() {
            if (!areasTable) return;
            if (cachedAdminData && cachedAdminData.areas) {
                areasTable.clear().rows.add(cachedAdminData.areas).draw();
                return;
            }
            $('#areasTable tbody').html('<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (areas) {
                areasTable.clear().rows.add(areas).draw();
            }).getAreasConfig();
        }

        function handleSaveArea(e) {
            e.preventDefault();
            const btn = $('#save-area-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                nombreArea: $('#form-area-name').val().trim(),
                actorUserId: currentUser.userId
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#form-area-name').val('');
                    showNotification('Éxito', res.message, 'success');
                    populateAreasTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).addArea(data);
        }

        function handleRenameArea() {
            const id = $(this).data('id');
            const oldName = $(this).data('name');
            const newName = prompt('Ingrese el nuevo nombre para el área:', oldName);
            if (newName === null) return;
            const cleanName = newName.trim();
            if (cleanName === '') {
                alert('El nombre no puede estar vacío.');
                return;
            }

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateAreasTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).updateAreaName(id, cleanName, currentUser.userId);
        }

        function handleDeleteArea() {
            const id = $(this).data('id');
            if (!confirm('¿Seguro de desactivar esta área? Los usuarios asociados no se eliminarán pero el área quedará inactiva.')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateAreasTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).deleteArea(id, currentUser.userId);
        }

        // =======================================================
        // ============= GESTIÓN DE AUDITORÍA (ADMIN) =============
        // =======================================================
        let auditTable = null;

        function initAuditTable() {
            auditTable = $('#auditTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: 'timestamp', className: 'dt-center' },
                    { data: 'nombreUsuario' },
                    { data: 'subRol', className: 'dt-center' },
                    {
                        data: 'accion', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'CREAR') b = 'success';
                            if (d === 'MODIFICAR') b = 'info';
                            if (d === 'APROBAR') b = 'primary';
                            if (d === 'RECHAZAR') b = 'warning';
                            if (d === 'ELIMINAR') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    { data: 'modulo', className: 'dt-center' },
                    { data: 'detalle' },
                    {
                        data: 'resultado', className: 'dt-center', render: function (d) {
                            return '<span class="badge badge-' + (d === 'OK' ? 'success' : 'danger') + '">' + d + '</span>';
                        }
                    },
                    { data: 'areasActor', className: 'dt-center' }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAuditTable();
        }

        function populateAuditTable() {
            if (!auditTable) return;
            const filters = {
                startDate: $('#audit-filter-start').val(),
                endDate: $('#audit-filter-end').val(),
                modulo: $('#audit-filter-module').val(),
                accion: $('#audit-filter-action').val()
            };

            if (!filters.startDate && !filters.endDate && !filters.modulo && !filters.accion && cachedAdminData && cachedAdminData.auditLog) {
                auditTable.clear().rows.add(cachedAdminData.auditLog).draw();
                return;
            }

            $('#auditTable tbody').html('<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando auditoría...</td></tr>');
            google.script.run.withSuccessHandler(function (logs) {
                auditTable.clear().rows.add(logs).draw();
            }).getAuditLog(filters);
        }

        // =======================================================
        // ============= SOLICITUDES DE BAJA (ADMIN) =============
        // =======================================================
        let deleteRequestsTable = null;

        function initDeleteRequestsTable() {
            deleteRequestsTable = $('#deleteRequestsTable').DataTable({
                data: [],
                columns: [
                    { data: 'fechaSolicitud', className: 'dt-center' },
                    { data: 'coordinadorNombre' },
                    { data: 'usuarioTargetNombre' },
                    { data: 'motivo' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'warning';
                            if (d === 'Aprobada') b = 'success';
                            if (d === 'Rechazada') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            if (r.estado === 'Pendiente') {
                                return '<div class="btn-group">' +
                                    '<button class="btn btn-success btn-sm approve-baja-btn mr-1" data-id="' + r.solicitudId + '" title="Aprobar"><i class="fas fa-check"></i></button>' +
                                    '<button class="btn btn-danger btn-sm reject-baja-btn" data-id="' + r.solicitudId + '" title="Rechazar"><i class="fas fa-times"></i></button>' +
                                    '</div>';
                            }
                            return '<span class="small text-muted">Resuelta por ' + r.adminResolutor + '</span>';
                        }
                    }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateDeleteRequestsTable();
        }

        function populateDeleteRequestsTable() {
            if (!deleteRequestsTable) return;
            if (cachedAdminData && cachedAdminData.deleteRequests) {
                deleteRequestsTable.clear().rows.add(cachedAdminData.deleteRequests).draw();
                return;
            }
            $('#deleteRequestsTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (reqs) {
                deleteRequestsTable.clear().rows.add(reqs).draw();
            }).getDeleteRequests();
        }

        function handleResolveDeleteRequest(button, decision) {
            const id = $(button).data('id');
            const actionText = decision === 'Aprobada' ? 'APROBAR y eliminar usuario' : 'RECHAZAR';
            const nota = prompt('Ingrese una nota o justificación para esta resolución (opcional):');
            if (nota === null) return;

            if (!confirm('¿Seguro de ' + actionText + ' esta solicitud de baja?')) return;

            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateDeleteRequestsTable();
                    populateUsersManagementTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(decision === 'Aprobada' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>');
                }
            }).resolveDeleteRequest(id, decision, currentUser.userId, nota);
        }

        // =======================================================
        // ============= REGLAS DE PERMISOS / ACCESO (ADMIN) =====
        // =======================================================
        function initAccessRules() {
            populateAccessRules();
        }

        function populateAccessRules() {
            const container = $('#access-rules-container');
            container.html('<div class="text-center py-4"><div class="spinner-border text-primary"></div> Cargando reglas...</div>');

            function render(rules) {
                container.empty();
                if (rules.length === 0) {
                    container.html('<div class="alert alert-info">No hay reglas configuradas.</div>');
                    return;
                }

                const groups = {};
                rules.forEach(function (r) {
                    if (!groups[r.subRol]) groups[r.subRol] = [];
                    groups[r.subRol].push(r);
                });

                for (const subRol in groups) {
                    let cardHtml = '<div class="card mb-3 shadow-sm border-left-info">' +
                        '<div class="card-header bg-light py-2"><h6 class="m-0 font-weight-bold text-info"><i class="fas fa-user-tag mr-1"></i> Permisos de: ' + subRol + '</h6></div>' +
                        '<div class="card-body py-2"><div class="table-responsive"><table class="table table-sm table-hover mb-0">' +
                        '<thead><tr><th>Módulo</th><th>Acción</th><th>Estado</th><th>Descripción</th><th>Cambiar</th></tr></thead><tbody>';

                    groups[subRol].forEach(function (r) {
                        const statusBadge = r.permitido ? '<span class="badge badge-success">Permitido</span>' : '<span class="badge badge-danger">Denegado</span>';
                        const toggleBtn = r.permitido ?
                            '<button class="btn btn-xs btn-danger toggle-rule-btn py-0 px-2" data-id="' + r.reglaId + '" data-subrol="' + r.subRol + '" data-modulo="' + r.modulo + '" data-accion="' + r.accion + '" data-value="false">Denegar</button>' :
                            '<button class="btn btn-xs btn-success toggle-rule-btn py-0 px-2" data-id="' + r.reglaId + '" data-subrol="' + r.subRol + '" data-modulo="' + r.modulo + '" data-accion="' + r.accion + '" data-value="true">Permitir</button>';

                        cardHtml += '<tr>' +
                            '<td>' + r.modulo + '</td>' +
                            '<td><code>' + r.accion + '</code></td>' +
                            '<td>' + statusBadge + '</td>' +
                            '<td class="small text-muted">' + r.descripcion + '</td>' +
                            '<td>' + toggleBtn + '</td>' +
                            '</tr>';
                    });

                    cardHtml += '</tbody></table></div></div></div>';
                    container.append(cardHtml);
                }

                $('.toggle-rule-btn').on('click', function () {
                    const btn = $(this);
                    const subRol = btn.data('subrol');
                    const modulo = btn.data('modulo');
                    const accion = btn.data('accion');
                    const val = btn.data('value') === true || btn.data('value') === 'true';

                    btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

                    google.script.run.withSuccessHandler(function (res) {
                        if (res.success) {
                            cachedAdminData = null;
                            populateAccessRules();
                        } else {
                            alert('Error: ' + res.message);
                            btn.prop('disabled', false);
                        }
                    }).setPermisoRol({
                        subRol: subRol,
                        modulo: modulo,
                        accion: accion,
                        permitido: val,
                        actorUserId: currentUser.userId,
                        descripcion: 'Modificado desde el panel de reglas'
                    });
                });
            }

            if (cachedAdminData && cachedAdminData.accessRules) {
                render(cachedAdminData.accessRules);
                return;
            }

            google.script.run.withSuccessHandler(render).getPermisosRoles();
        }

        // =======================================================
        // ============= GESTIÓN DE COORDINADORES =================
        // =======================================================
        let coordAttendanceTable = null;
        let coordUsersTable = null;
        let coordPermissionsTable = null;
        let coordDutiesTable = null;
        let coordHoursTable = null;
        let coordSubstitutionsTable = null;

        function loadCoordinadorDashboard() {
            loadView('CoordinadorDashboard.html', function () {
                $('#user-name-display').text(currentUser.name);
                $('#logout-button').on('click', logout);

                if (currentUser.foto && currentUser.foto !== "") {
                    $('.img-profile').attr('src', getSafeDriveImageUrl(currentUser.foto));
                }
                const startStr = $('#coord-filter-start-date').val() || '';
                const endStr = $('#coord-filter-end-date').val() || '';

                $('#coordAttendanceTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');
                $('#coordUsersTable tbody').html('<tr><td colspan="10" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando datos...</td></tr>');

                // FASE 1: Datos críticos para render inmediato
                google.script.run.withFailureHandler(function (err) {
                    showNotification("Error", "Error de conexión o autorización: " + (err ? err.message : "Desconocido"), "danger");
                }).withSuccessHandler(function (data) {
                    if (!data || data.error) {
                        const errorMsg = (data && data.error) ? data.error : "Conflicto de permisos o sesión expirada.";
                        showNotification("Error", "Error al cargar datos del panel: " + errorMsg, "danger");
                        return;
                    }
                    cachedCoordinatorData = data; window.cachedCoordinatorData = data;

                    // Aplicar restricciones de pestañas y tarjetas según permisos dinámicos y sub-rol
                    const tabsCoord = [
                        { id: '#coord-dashboard-tab', cardId: '#coord-card-dashboard', action: 'dashboard' },
                        { id: '#coord-users-tab', cardId: '#coord-card-users', action: 'users' },
                        { id: '#coord-permissions-tab', cardId: '#coord-card-permissions', action: 'permissions' },
                        { id: '#coord-duties-tab', cardId: '#coord-card-duties', action: 'duties' },
                        { id: '#coord-hours-tab', cardId: '#coord-card-hours', action: 'hours-report' },
                        { id: '#coord-suplencias-tab', cardId: '#coord-card-suplencias', action: 'suplencias' },
                        { id: '#coord-warnings-tab', cardId: '#coord-card-warnings', action: 'warnings' },
                        { id: '#coord-schedules-tab', cardId: '#coord-card-schedules', action: 'schedules' },
                        { id: '#coord-reports-tab', cardId: '#coord-card-reports', action: 'reports' },
                        { id: '#coord-manual-requests-tab', cardId: '#coord-card-manual-requests', action: 'manual-requests' }
                    ];

                    tabsCoord.forEach(tab => {
                        if (hasPermission('CoordDashboard', tab.action)) {
                            $(tab.id).closest('li').show();
                            $(tab.cardId).show();
                        } else {
                            $(tab.id).closest('li').hide();
                            $(tab.cardId).hide();
                        }
                    });

                    // Navegación interactiva mediante tarjetas
                    $('#coord-home-panel').on('click', '.menu-card', function () {
                        const target = $(this).data('target');
                        if (target) {
                            $(target).tab('show');
                        }
                    });

                    // Set up area badge
                    if (currentUser.areas && currentUser.areas.length > 0 && data.areasConfig) {
                        const myAreaNames = data.areasConfig.filter(a => currentUser.areas.indexOf(a.areaId) !== -1).map(a => a.nombreArea);
                        if (myAreaNames.length > 0) {
                            $('#coord-area-badge-text').html('<strong>Coordinador de:</strong> ' + myAreaNames.join(', '));
                        } else {
                            $('#coord-area-badge-text').html('<strong>Coordinador de:</strong> ' + currentUser.areas.join(', '));
                        }
                    } else {
                        $('#coord-area-badge-text').html('<strong>Coordinador sin área asignada</strong>');
                    }

                    // --- Listeners de Refresco ---
                    $('#coord-refresh-attendance').on('click', function () {
                        cachedCoordinatorData.attendance = null;
                        populateCoordAttendanceTable();
                    });
                    $('#coord-refresh-users').on('click', function () {
                        cachedCoordinatorData.users = null;
                        populateCoordUsersTable();
                    });
                    $('#coord-refresh-permissions').on('click', function () {
                        cachedCoordinatorData.permissions = null;
                        populateCoordPermissionsTable();
                    });
                    $('#coord-refresh-duties').on('click', function () {
                        cachedCoordinatorData.duties = null;
                        populateCoordDutiesTable();
                    });
                    $('#coord-refresh-hours').on('click', function () {
                        cachedCoordinatorData.hoursReport = null;
                        populateCoordHoursTable();
                    });
                    $('#coord-refresh-substitutions').on('click', function () {
                        cachedCoordinatorData.substitutions = null;
                        populateCoordSubstitutionsTable();
                    });
                    $('#coord-refresh-warnings-btn').on('click', function () {
                        cachedCoordinatorData.warnings = null;
                        populateCoordWarningsTable();
                    });
                    $('#coord-refresh-schedules-btn').on('click', function () {
                        cachedCoordinatorData.schedules = null;
                        populateCoordSchedulesTable();
                    });
                    $('#refresh-coord-manual-requests-btn').on('click', function () {
                        cachedCoordinatorData.manualRequests = null;
                        populateCoordManualRequestsTable();
                    });

                    // --- Listeners Dashboard (Filtros sin recargar HTML) ---
                    $('#coord-filter-start-date, #coord-filter-end-date').on('change', function () {
                        refreshCoordinatorDashboardData();
                    });
                    $('#coord-clear-filter-btn').on('click', function () {
                        $('#coord-filter-start-date, #coord-filter-end-date').val('');
                        refreshCoordinatorDashboardData();
                    });

                    // --- Listeners Horas ---
                    $('#coord-hours-start, #coord-hours-end').on('change', populateCoordHoursTable);
                    $('#coord-hours-clear').on('click', function () {
                        $('#coord-hours-start, #coord-hours-end').val('');
                        populateCoordHoursTable();
                    });

                    // --- Listeners Personal ---
                    $('#coord-add-user-btn').on('click', handleCoordAddUser);
                    $('#coord-user-form').on('submit', handleCoordSaveUser);
                    $('#coordUsersTable tbody').on('click', '.coord-edit-user-btn', handleCoordEditUser);
                    $('#coordUsersTable tbody').on('click', '.coord-request-delete-btn', handleShowRequestDeleteModal);
                    $('#submit-delete-request-btn').on('click', handleSaveDeleteRequest);
                    $('#coordUsersTable tbody').on('click', '.coord-add-entry-btn', function () { handleCoordManualRecord(this, 'Entrada'); });
                    $('#coordUsersTable tbody').on('click', '.coord-add-exit-btn', function () { handleCoordManualRecord(this, 'Salida'); });

                    // --- Listeners Permisos ---
                    $('#coord-create-permission-btn').on('click', handleCoordCreatePermission);
                    $('#coord-permission-form').on('submit', handleCoordSavePermission);
                    $('#coordPermissionsTable tbody').on('click', '.coord-approve-permission-btn', function () { handleCoordUpdatePermissionStatus(this, 'Aprobado'); });
                    $('#coordPermissionsTable tbody').on('click', '.coord-reject-permission-btn', function () { handleCoordUpdatePermissionStatus(this, 'Rechazado'); });
                    $('#coordPermissionsTable tbody').on('click', '.coord-delete-permission-btn', handleCoordDeletePermission);

                    // --- Listeners Suplencias ---
                    $('#coord-add-substitution-btn').on('click', showCoordSubstitutionModal);
                    $('#coord-substitution-form').on('submit', handleCoordSaveSubstitution);
                    $('#coordSubstitutionsTable tbody').on('click', '.coord-approve-sub-btn', function () { handleCoordUpdateSubstitutionStatus(this, 'Aprobada'); });
                    $('#coordSubstitutionsTable tbody').on('click', '.coord-reject-sub-btn', function () { handleCoordUpdateSubstitutionStatus(this, 'Rechazada'); });
                    $('#coordSubstitutionsTable tbody').on('click', '.coord-delete-sub-btn', handleCoordDeleteSubstitution);

                    // --- Listeners Guardias ---
                    $('#coord-duty-form').on('submit', handleCoordSaveDuty);
                    $('#coordDutiesTable tbody').on('click', '.coord-delete-duty-btn', handleCoordDeleteDuty);

                    // --- Listeners de Amonestaciones ---
                    $('#coord-new-warning-btn').on('click', function () {
                        $('#coord-create-warning-form')[0].reset();
                        const userSelect = $('#form-coord-warning-user').html('<option value="">Cargando...</option>');
                        const typeSelect = $('#form-coord-warning-type').html('<option value="">Cargando...</option>');
                        if (cachedCoordinatorData.users) {
                            userSelect.empty().append('<option value="" disabled selected>Seleccione usuario...</option>');
                            cachedCoordinatorData.users.forEach(function (u) {
                                if (u.estado === 'Activo') userSelect.append('<option value="' + u.userId + '">' + u.name + '</option>');
                            });
                        }
                        if (cachedCoordinatorData.warningTypes) {
                            typeSelect.empty().append('<option value="" disabled selected>Seleccione tipo...</option>');
                            cachedCoordinatorData.warningTypes.forEach(function (t) {
                                if (t.estado === 'Activo') typeSelect.append('<option value="' + t.tipoId + '">' + t.nombre + ' (' + t.gravedad + ')</option>');
                            });
                        }
                        $('#coordCreateWarningModal').modal('show');
                    });
                    $('#coord-create-warning-form').on('submit', handleSaveCoordWarning);
                    $('#coordWarningsTable tbody').on('click', '.coord-request-anul-btn', handleShowCoordRequestAnulacionModal);
                    $('#coord-request-anulacion-form').on('submit', handleSaveCoordRequestAnulacion);

                    // --- Listener botón de reportes Coordinador ---
                    $('#btn-generate-report-coord').on('click', function () {
                        openReportGenerator(currentUser.areas);
                    });

                    // --- INICIALIZACIONES ---
                    initCoordAttendanceTable();
                    initCoordUsersTable();
                    initCoordPermissionsTable();
                    initCoordDutiesTable();
                    initCoordHoursTable();
                    initCoordSubstitutionsTable();
                    initCoordWarningsTable();
                    initCoordSchedulesTable();
                    initCoordApprovedSchedulesTable();
                    initCoordManualRequestsTable();

                    $('#coordManualRequestsTable tbody').on('click', '.approve-request-btn', function () {
                        handleResolveManualRequest(this, 'Aprobada');
                    });
                    $('#coordManualRequestsTable tbody').on('click', '.reject-request-btn', function () {
                        handleResolveManualRequest(this, 'Rechazada');
                    });

                    // Populate Phase 1 tables
                    populateCoordAttendanceTable();
                    populateCoordUsersTable();

                    // Set up stats asynchronously in second plano
                    updateCoordStats();

                    $('a[data-toggle="tab"]').on('shown.bs.tab', function () {
                        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                    });

                    // =====================================================
                    // FASE 2: Datos secundarios — carga en background
                    // =====================================================
                    const phase2Banner = $('<div class="alert alert-info alert-dismissible py-1 px-2 mb-2" id="coord-phase2-loading-banner" style="font-size:0.85em;"><i class="fas fa-sync fa-spin mr-1"></i> Cargando datos adicionales en segundo plano...</div>');
                    $('#coordinator-panel-body, .tab-content').first().prepend(phase2Banner);

                    google.script.run.withFailureHandler(function () {
                        $('#coord-phase2-loading-banner').remove();
                    }).withSuccessHandler(function (phase2Data) {
                        if (phase2Data && !phase2Data.error) {
                            Object.assign(cachedCoordinatorData, phase2Data);
                            // Refrescar tablas secundarias
                            populateCoordPermissionsTable();
                            populateCoordDutiesTable();
                            populateCoordHoursTable();
                            populateCoordSubstitutionsTable();
                            populateCoordWarningsTable();
                            populateCoordSchedulesTable();
                            populateCoordApprovedSchedulesTable();
                            populateCoordManualRequestsTable();
                        }
                        $('#coord-phase2-loading-banner').fadeOut(500, function () { $(this).remove(); });
                    }).getCoordinatorDashboardData_Phase2(currentUser.areas, startStr, endStr);

                }).getCoordinatorDashboardData_Phase1(currentUser.areas);
            });
        }

        function refreshCoordinatorDashboardData() {
            const startStr = $('#coord-filter-start-date').val() || '';
            const endStr = $('#coord-filter-end-date').val() || '';

            google.script.run.withFailureHandler(function (err) {
                showNotification("Error", "Error al refrescar datos: " + (err ? err.message : "Desconocido"), "danger");
            }).withSuccessHandler(function (filteredData) {
                if (!filteredData || filteredData.error) return;
                if (filteredData.stats) cachedCoordinatorData.stats = filteredData.stats;
                if (filteredData.attendance) cachedCoordinatorData.attendance = filteredData.attendance;
                if (filteredData.hoursReport) cachedCoordinatorData.hoursReport = filteredData.hoursReport;

                // Repintar stats
                if (cachedCoordinatorData.stats) {
                    $('#coord-stats-total-users').text(cachedCoordinatorData.stats.totalUsers);
                    $('#coord-stats-today-checks').text(cachedCoordinatorData.stats.todayChecks);
                    $('#coord-stats-pending-perms').text(cachedCoordinatorData.stats.pendingPerms);
                    $('#coord-stats-pending-subs').text(cachedCoordinatorData.stats.pendingSubs);
                }

                populateCoordAttendanceTable();
                populateCoordHoursTable();
            }).refreshCoordinatorDashboardFiltered(currentUser.areas, startStr, endStr);
        }

        function initCoordAttendanceTable() {
            coordAttendanceTable = $('#coordAttendanceTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: "timestamp", className: "dt-center" },
                    { data: "name" },
                    { data: "institucion" },
                    { data: "turno" },
                    { data: "type", className: "dt-center", render: function (d) { return '<span class="badge badge-pill badge-' + (d === "Entrada" ? "success" : "danger") + '">' + d + '</span>'; } },
                    {
                        data: "status", className: "dt-center", render: function (d) {
                            let b = 'primary';
                            if (d === 'Fuera de Rango') b = 'warning';
                            if (d === 'Registro Manual' || d === 'Cierre Manual') b = 'info';
                            if (d === 'Cierre Automático') b = 'secondary';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    { data: "distance", className: "dt-center" }
                ],
                order: [[0, "desc"]],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordAttendanceTable();
        }

        function populateCoordAttendanceTable() {
            if (!coordAttendanceTable) return;
            const startDate = $('#coord-filter-start-date').val();
            const endDate = $('#coord-filter-end-date').val();
            $('#coordAttendanceTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (!startDate && !endDate && cachedCoordinatorData && cachedCoordinatorData.attendance) {
                coordAttendanceTable.clear().rows.add(cachedCoordinatorData.attendance).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (r) {
                if (!startDate && !endDate && cachedCoordinatorData) cachedCoordinatorData.attendance = r;
                coordAttendanceTable.clear().rows.add(r).draw();
            }).getAttendanceRecordsForCoordinator(currentUser.areas, startDate, endDate);
        }

        function initCoordUsersTable() {
            coordUsersTable = $('#coordUsersTable').DataTable({
                data: [],
                columns: [
                    {
                        title: 'Foto', data: 'foto', className: "dt-center", render: function (d) {
                            if (d && String(d).startsWith('http')) {
                                let imgUrl = getSafeDriveImageUrl(d);
                                return '<img src="' + imgUrl + '" class="clickable-photo" style="width:40px;height:40px;border-radius:50%;object-fit:cover;box-shadow:0 2px 5px rgba(0,0,0,0.1); cursor:pointer;" onerror="this.outerHTML=\'<i class=\\\'fas fa-user-circle fa-2x text-gray-300\\\'></i>\'">';
                            }
                            return '<i class="fas fa-user-circle fa-2x text-gray-300"></i>';
                        }
                    },
                    { title: 'Nombre', data: 'name' },
                    { title: 'Email', data: 'email', className: "dt-center" },
                    { title: 'Sub-Rol', data: 'subRol', className: "dt-center", render: function (d) { return '<span class="badge badge-primary">' + d + '</span>'; } },
                    { title: 'Cédula', data: 'cedula', className: "dt-center" },
                    { title: 'Institución', data: 'institucion', className: "dt-center" },
                    { title: 'Turno', data: 'turno', className: "dt-center" },
                    {
                        title: 'Estado', data: 'estado', className: "dt-center", render: function (d) {
                            let b = (d === 'Inactivo' ? 'danger' : 'success');
                            return '<span class="badge badge-' + b + '">' + (d || 'Activo') + '</span>';
                        }
                    },
                    {
                        title: 'Desde', data: 'fechaInclusion', className: "dt-center", render: function (d) {
                            return d || 'N/A';
                        }
                    },
                    { title: 'ID', data: 'userId', visible: false },
                    {
                        title: 'Equipo', data: 'dispositivoVinculadoId', className: "dt-center", render: function (d, t, r) {
                            if (d) {
                                return '<span class="badge badge-success" title="' + (r.dispositivoInfo || '') + '"><i class="fas fa-mobile-alt mr-1"></i> Vinculado</span>';
                            }
                            return '<span class="badge badge-secondary"><i class="fas fa-question-circle mr-1"></i> Sin vincular</span>';
                        }
                    },
                    {
                        title: 'Acciones', data: null, className: "dt-center", orderable: false, render: function (d, t, r) {
                            let resetBtn = '';
                            if (r.dispositivoVinculadoId) {
                                resetBtn = '<button class="btn btn-secondary btn-sm reset-device-btn" title="Desvincular Dispositivo Registrado" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-mobile-alt"></i><i class="fas fa-times text-danger ml-1"></i></button>';
                            }
                            return '<div class="btn-group" role="group">' +
                                '<button class="btn btn-success btn-sm coord-add-entry-btn mr-1" title="Entrada" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-sign-in-alt"></i></button>' +
                                '<button class="btn btn-danger btn-sm coord-add-exit-btn mr-1" title="Salida" data-user-id="' + r.userId + '" data-user-name="' + r.name + '"><i class="fas fa-sign-out-alt"></i></button>' +
                                '<button class="btn btn-warning btn-sm coord-edit-user-btn" title="Editar"><i class="fas fa-edit"></i></button>' +
                                resetBtn +
                                '<button class="btn btn-danger btn-sm coord-request-delete-btn" title="Solicitar Baja" data-id="' + r.userId + '" data-name="' + r.name + '"><i class="fas fa-user-minus"></i></button>' +
                                '</div>';
                        }
                    }
                ],
                order: [[1, 'asc']],
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }
            });
            populateCoordUsersTable();
        }

        function populateCoordUsersTable() {
            if (!coordUsersTable) return;
            $('#coordUsersTable tbody').html('<tr><td colspan="10" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.users) {
                coordUsersTable.clear().rows.add(cachedCoordinatorData.users).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (users) {
                if (cachedCoordinatorData) cachedCoordinatorData.users = users;
                coordUsersTable.clear().rows.add(users).draw();
            }).getAllUsersForCoordinator(currentUser.areas);
        }

        function handleCoordAddUser() {
            $('#coord-user-form')[0].reset();
            $('#coord-form-user-tolerancia').val('');
            $('#coord-user-modal-title').text('Añadir Personal a mi Área');
            $('#coord-form-user-id').val('');
            $('#coord-form-user-password').prop('required', true);
            $('#coordUserModal').modal('show');
        }

        function handleCoordEditUser() {
            const rowData = coordUsersTable.row($(this).closest('tr')).data();
            $('#coord-user-form')[0].reset();
            $('#coord-user-modal-title').text('Editar Usuario: ' + rowData.name);
            $('#coord-form-user-id').val(rowData.userId);
            $('#coord-form-user-name').val(rowData.name);
            $('#coord-form-user-cedula').val(rowData.cedula);
            $('#coord-form-user-email').val(rowData.email);
            $('#coord-form-user-password').prop('required', false);
            $('#coord-form-user-telefono').val(rowData.telefono);
            $('#coord-form-user-institucion').val(rowData.institucion);
            $('#coord-form-user-direccion').val(rowData.direccion);
            $('#coord-form-user-subrol').val(rowData.subRol || 'Operador/a');
            $('#coord-form-user-turno').val(rowData.turno);
            $('#coord-form-user-estado').val(rowData.estado || 'Activo');
            $('#coord-form-user-tolerancia').val(rowData.toleranciaPersonalizada !== null && rowData.toleranciaPersonalizada !== undefined ? rowData.toleranciaPersonalizada : '');
            $('#coordUserModal').modal('show');
        }

        function handleCoordSaveUser(e) {
            e.preventDefault();
            const btn = $('#coord-save-user-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Guardando...');

            const userId = $('#coord-form-user-id').val();
            let userAreas = currentUser.areas || [];
            if (userId) {
                const rowData = coordUsersTable.rows().data().toArray().find(u => String(u.userId) === String(userId));
                if (rowData && rowData.areas) userAreas = rowData.areas;
            }

            const toleranciaVal = $('#coord-form-user-tolerancia').val();
            const toleranciaPersonalizada = (toleranciaVal === '' || isNaN(toleranciaVal)) ? null : parseInt(toleranciaVal, 10);

            const userData = {
                userId: userId,
                name: $('#coord-form-user-name').val(),
                cedula: $('#coord-form-user-cedula').val(),
                email: $('#coord-form-user-email').val(),
                password: $('#coord-form-user-password').val(),
                telefono: $('#coord-form-user-telefono').val(),
                institucion: $('#coord-form-user-institucion').val(),
                direccion: $('#coord-form-user-direccion').val(),
                subRol: $('#coord-form-user-subrol').val(),
                role: 'Usuario',
                turno: $('#coord-form-user-turno').val(),
                estado: $('#coord-form-user-estado').val(),
                areas: userAreas,
                toleranciaPersonalizada: toleranciaPersonalizada,
                actorUserId: currentUser.userId
            };

            const operation = userId ? 'updateUser' : 'addNewUser';

            google.script.run.withSuccessHandler(function (response) {
                btn.prop('disabled', false).html(orig);
                if (response.success) {
                    $('#coordUserModal').modal('hide');
                    showNotification('Éxito', response.message, 'success');
                    populateCoordUsersTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', response.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            })[operation](userData);
        }

        function handleShowRequestDeleteModal() {
            const id = $(this).data('id');
            const name = $(this).data('name');

            $('#delete-request-target-id').val(id);
            $('#delete-request-target-name').text(name);
            $('#delete-request-motivo').val('');
            $('#requestDeleteModal').modal('show');
        }

        function handleSaveDeleteRequest() {
            const btn = $('#submit-delete-request-btn');
            const orig = btn.html();
            const motivo = $('#delete-request-motivo').val().trim();

            if (!motivo) {
                alert('Por favor exprese el motivo de la baja.');
                return;
            }

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Enviando...');

            const data = {
                coordinadorId: currentUser.userId,
                usuarioTargetId: $('#delete-request-target-id').val(),
                motivo: motivo
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#requestDeleteModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).createDeleteRequest(data);
        }

        function handleCoordManualRecord(button, type) {
            const userName = $(button).data('user-name');
            const userId = $(button).data('user-id');
            const originalIcon = $(button).html();

            if (!confirm('¿Registrar ' + type + ' de ' + userName + '?')) return;

            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (response) {
                $(button).prop('disabled', false).html(originalIcon);
                if (response.success) {
                    showNotification('Éxito', response.message, 'success');
                    if (cachedCoordinatorData) {
                        cachedCoordinatorData.attendance = null;
                        cachedCoordinatorData.stats = null;
                    }
                    populateCoordAttendanceTable();
                    updateCoordStats();
                } else {
                    showNotification('Denegado', response.message, 'warning');
                }
            }).withFailureHandler(function (error) {
                $(button).prop('disabled', false).html(originalIcon);
                showNotification('Error', error.message, 'danger');
            }).adminRecordAttendance({
                userId: userId,
                name: userName,
                type: type,
                actorUserId: currentUser.userId
            });
        }

        function initCoordPermissionsTable() {
            coordPermissionsTable = $('#coordPermissionsTable').DataTable({
                data: [],
                columns: [
                    { data: 'userName' },
                    { data: null, render: function (r) { return r.fechaInicio + ' al ' + r.fechaFin; } },
                    { data: 'tipoPermiso', className: 'dt-center' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Aprobado') b = 'success';
                            if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    { data: 'comentarios', render: function (d) { return d || 'N/A'; } },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            if (r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-success btn-sm coord-approve-permission-btn" title="Aprobar" data-id="' + r.permisoId + '"><i class="fas fa-check"></i></button> ';
                                actions += '<button class="btn btn-warning btn-sm coord-reject-permission-btn" title="Rechazar" data-id="' + r.permisoId + '"><i class="fas fa-times"></i></button> ';
                            }
                            actions += '<button class="btn btn-danger btn-sm coord-delete-permission-btn" title="Eliminar" data-id="' + r.permisoId + '"><i class="fas fa-trash"></i></button>';
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                order: [[1, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordPermissionsTable();
        }

        function populateCoordPermissionsTable() {
            if (!coordPermissionsTable) return;
            $('#coordPermissionsTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.permissions) {
                coordPermissionsTable.clear().rows.add(cachedCoordinatorData.permissions).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedCoordinatorData) cachedCoordinatorData.permissions = d;
                coordPermissionsTable.clear().rows.add(d).draw();
            }).getPermissionRequestsForCoordinator(currentUser.areas);
        }

        function handleCoordCreatePermission() {
            $('#coord-permission-form')[0].reset();
            const userSelect = $('#coord-form-permission-user').html('<option value="">Cargando...</option>');

            google.script.run.withSuccessHandler(function (users) {
                userSelect.empty().append('<option value="" disabled selected>Seleccione...</option>');
                users.forEach(function (u) {
                    if (u.estado === 'Activo') {
                        userSelect.append('<option value="' + u.userId + '">' + u.name + '</option>');
                    }
                });
                $('#coordPermissionModal').modal('show');
            }).getAllUsersForCoordinator(currentUser.areas);
        }

        function handleCoordSavePermission(e) {
            e.preventDefault();
            const btn = $('#coord-save-permission-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                userId: $('#coord-form-permission-user').val(),
                startDate: $('#coord-form-permission-start').val(),
                endDate: $('#coord-form-permission-end').val(),
                type: $('#coord-form-permission-type').val(),
                comments: $('#coord-form-permission-comments').val(),
                actorUserId: currentUser.userId
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#coordPermissionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateCoordPermissionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).adminCreatePermission(data);
        }

        function handleCoordUpdatePermissionStatus(button, newStatus) {
            const permisoId = $(button).data('id');
            if (!confirm('¿Seguro que desea ' + newStatus.toLowerCase() + ' esta solicitud?')) return;

            const icon = $(button).html();
            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCoordPermissionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(icon);
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                $(button).prop('disabled', false).html(icon);
            }).updatePermissionStatus(permisoId, newStatus, currentUser.userId);
        }

        function handleCoordDeletePermission() {
            const permisoId = $(this).data('id');
            if (!confirm('¿Seguro de eliminar esta solicitud?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCoordPermissionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).deletePermissionRequest(permisoId, currentUser.userId);
        }

        function initCoordDutiesTable() {
            coordDutiesTable = $('#coordDutiesTable').DataTable({
                data: [],
                columns: [
                    { data: 'date', className: 'dt-center' },
                    { data: 'turno' },
                    { data: 'descripcion' },
                    { data: 'creadoPor' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return '<button class="btn btn-danger btn-sm coord-delete-duty-btn" title="Eliminar" data-date="' + r.date + '"><i class="fas fa-trash-alt"></i></button>';
                        }
                    }
                ],
                order: [[0, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordDutiesTable();
        }

        function populateCoordDutiesTable() {
            if (!coordDutiesTable) return;
            $('#coordDutiesTable tbody').html('<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.duties) {
                coordDutiesTable.clear().rows.add(cachedCoordinatorData.duties).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedCoordinatorData) cachedCoordinatorData.duties = d;
                coordDutiesTable.clear().rows.add(d).draw();
            }).getDutyShifts();
        }

        function handleCoordSaveDuty(e) {
            e.preventDefault();
            const btn = $('#coord-save-duty-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const dutyData = {
                date: $('#coord-duty-date').val(),
                turno: $('#coord-duty-turno').val(),
                descripcion: $('#coord-duty-description').val(),
                categoria: 'Guardia Ordinaria',
                creadoPor: currentUser.name,
                actorUserId: currentUser.userId
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#coord-duty-form')[0].reset();
                    showNotification('Éxito', res.message, 'success');
                    populateCoordDutiesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).addDutyShift(dutyData);
        }

        // Adapt delete duty for coord
        function handleCoordDeleteDuty() {
            const dutyDate = $(this).data('date');
            if (!confirm('¿Eliminar guardia del ' + dutyDate + '?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCoordDutiesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).deleteDutyShift(dutyDate, currentUser.userId);
        }

        function initCoordHoursTable() {
            coordHoursTable = $('#coordHoursTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: 'name' },
                    { data: 'institucion', className: 'dt-center' },
                    { data: 'turno', className: 'dt-center' },
                    { data: 'daysWorked', className: 'dt-center text-success font-weight-bold' },
                    { data: 'absentDaysCount', className: 'dt-center text-danger font-weight-bold' },
                    { data: 'totalHours', className: 'dt-center' },
                    { data: null, className: 'dt-center', orderable: false, render: function () { return '<button class="btn btn-primary btn-sm view-detail-btn" data-toggle="modal" data-target="#detailedReportModal" title="Ver detalle"><i class="fas fa-eye"></i></button>'; } }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });

            const today = new Date();
            const oneMonthAgo = new Date(new Date().setMonth(today.getMonth() - 1));
            $('#coord-hours-start').val(oneMonthAgo.toISOString().split('T')[0]);
            $('#coord-hours-end').val(today.toISOString().split('T')[0]);
            populateCoordHoursTable();
        }

        function populateCoordHoursTable() {
            if (!coordHoursTable) return;
            const start = $('#coord-hours-start').val();
            const end = $('#coord-hours-end').val();
            $('#coordHoursTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');

            const today = new Date();
            const oneMonthAgo = new Date(new Date().setMonth(today.getMonth() - 1));
            const defaultStart = oneMonthAgo.toISOString().split('T')[0];
            const defaultEnd = today.toISOString().split('T')[0];
            const isDefault = (start === defaultStart && end === defaultEnd) || (!start && !end);

            if (isDefault && cachedCoordinatorData && cachedCoordinatorData.hoursReport) {
                coordHoursTable.clear().rows.add(cachedCoordinatorData.hoursReport).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (isDefault && cachedCoordinatorData) cachedCoordinatorData.hoursReport = d;
                coordHoursTable.clear().rows.add(d).draw();
            }).calculateHoursWorkedReportForCoordinator(currentUser.areas, start, end);
        }

        function initCoordSubstitutionsTable() {
            coordSubstitutionsTable = $('#coordSubstitutionsTable').DataTable({
                data: [],
                columns: [
                    { data: 'titularName' },
                    { data: 'suplenteName' },
                    { data: 'startDate', className: 'dt-center' },
                    { data: 'endDate', className: 'dt-center' },
                    { data: 'titularTurno', className: 'dt-center' },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary', i = 'fas fa-info-circle';
                            if (d.includes('Aprobada')) { b = 'success'; i = 'fas fa-check-circle'; }
                            else if (d === 'Pendiente de Admin' || d === 'Pendiente') { b = 'primary'; i = 'fas fa-user-shield'; }
                            else if (d === 'Pendiente de Titular') { b = 'warning'; i = 'fas fa-user-clock'; }
                            else if (d === 'Rechazada') { b = 'danger'; i = 'fas fa-times-circle'; }
                            else if (d === 'Disponible') { b = 'secondary'; i = 'fas fa-info-circle'; }
                            return '<span class="badge badge-' + b + '"><i class="' + i + ' mr-1"></i>' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            if (r.estado === 'Pendiente de Admin' || r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-success btn-sm coord-approve-sub-btn" title="Aprobar Suplencia" data-id="' + r.subId + '"><i class="fas fa-check"></i></button> ';
                            }
                            if (r.estado === 'Pendiente de Admin' || r.estado === 'Pendiente de Titular' || r.estado === 'Pendiente') {
                                actions += '<button class="btn btn-warning btn-sm coord-reject-sub-btn" title="Rechazar Suplencia" data-id="' + r.subId + '"><i class="fas fa-times"></i></button> ';
                            }
                            if (r.estado !== 'Aprobada') {
                                actions += '<button class="btn btn-danger btn-sm coord-delete-sub-btn" title="Eliminar" data-id="' + r.subId + '"><i class="fas fa-trash"></i></button>';
                            }
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                order: [[2, 'desc']],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordSubstitutionsTable();
        }

        function populateCoordSubstitutionsTable() {
            if (!coordSubstitutionsTable) return;
            $('#coordSubstitutionsTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.substitutions) {
                coordSubstitutionsTable.clear().rows.add(cachedCoordinatorData.substitutions).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedCoordinatorData) cachedCoordinatorData.substitutions = d;
                coordSubstitutionsTable.clear().rows.add(d).draw();
            }).getSubstitutionsForCoordinator(currentUser.areas);
        }

        function showCoordSubstitutionModal() {
            $('#coord-substitution-form')[0].reset();
            const titularSel = $('#coord-sub-titular').html('<option value="">Cargando...</option>');
            const suplenteSel = $('#coord-sub-suplente').html('<option value="">Cargando...</option>');

            google.script.run.withSuccessHandler(function (users) {
                titularSel.empty().append('<option value="" disabled selected>Seleccione...</option>');
                suplenteSel.empty().append('<option value="" disabled selected>Seleccione...</option>');
                users.forEach(function (u) {
                    if (u.estado === 'Activo') {
                        titularSel.append('<option value="' + u.userId + '">' + u.name + ' (' + u.turno + ')</option>');
                        suplenteSel.append('<option value="' + u.userId + '">' + u.name + ' (' + u.turno + ')</option>');
                    }
                });
                $('#coordSubstitutionModal').modal('show');
            }).getAllUsersForCoordinator(currentUser.areas);
        }

        function handleCoordSaveSubstitution(e) {
            e.preventDefault();
            const btn = $('#coord-save-substitution-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                titularId: $('#coord-sub-titular').val(),
                suplenteId: $('#coord-sub-suplente').val(),
                startDate: $('#coord-sub-start-date').val(),
                endDate: $('#coord-sub-end-date').val(),
                comentarios: $('#coord-sub-comentarios').val(),
                actorUserId: currentUser.userId
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#coordSubstitutionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateCoordSubstitutionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).createSubstitution(data);
        }

        function handleCoordUpdateSubstitutionStatus(button, newStatus) {
            const subId = $(button).data('id');
            if (!confirm('¿Seguro que desea ' + newStatus + ' esta suplencia?')) return;

            const icon = $(button).html();
            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCoordSubstitutionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(icon);
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                $(button).prop('disabled', false).html(icon);
            }).updateSubstitutionStatus(subId, newStatus, currentUser.userId);
        }

        function handleCoordDeleteSubstitution() {
            const subId = $(this).data('id');
            if (!confirm('¿Seguro de eliminar este registro?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateCoordSubstitutionsTable();
                    updateCoordStats();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
            }).deleteSubstitution(subId, currentUser.userId);
        }

        function updateCoordStats() {
            const s = '<div class="spinner-border spinner-border-sm"></div>';
            $('#coord-stats-total-users, #coord-stats-today-checks, #coord-stats-pending-perms, #coord-stats-pending-subs').html(s);
            google.script.run.withSuccessHandler(function (stats) {
                $('#coord-stats-total-users').text(stats.totalUsers);
                $('#coord-stats-today-checks').text(stats.todayChecks);
                $('#coord-stats-pending-perms').text(stats.pendingPerms);
                $('#coord-stats-pending-subs').text(stats.pendingSubs);
            }).getCoordDashboardStats(currentUser.areas);
        }

        // Arranque de la App
        (function () {
            let u = sessionStorage.getItem("currentUser");
            if (u) {
                currentUser = JSON.parse(u); window.currentUser = currentUser;
                masterQRId = currentUser.masterQRId || "QR-MAESTRO-ASISTENCIA-V1";
                routeByRole(currentUser);
            } else {
                loadLoginPage();
            }
        })();

        // =======================================================
        // ============= MODULO DE AMONESTACIONES =================
        // =======================================================

        // --- SECCIÓN: CONFIG HORARIOS ---
        function populateConfigHorarios() {
            function render(configs) {
                configs.forEach(c => {
                    if (c.clave === 'HORA_ENTRADA_MANANA') $('#cfg-in-manana').val(c.valor);
                    if (c.clave === 'HORA_SALIDA_MANANA') $('#cfg-out-manana').val(c.valor);
                    if (c.clave === 'HORA_ENTRADA_TARDE') $('#cfg-in-tarde').val(c.valor);
                    if (c.clave === 'HORA_SALIDA_TARDE') $('#cfg-out-tarde').val(c.valor);
                    if (c.clave === 'HORA_ENTRADA_MIXTO') $('#cfg-in-mixto').val(c.valor);
                    if (c.clave === 'HORA_SALIDA_MIXTO') $('#cfg-out-mixto').val(c.valor);
                    if (c.clave === 'TOLERANCIA_RETARDO_MIN') $('#cfg-tolerancia').val(c.valor);
                });
            }
            if (cachedAdminData && cachedAdminData.configHorarios) {
                render(cachedAdminData.configHorarios);
                return;
            }
            google.script.run.withSuccessHandler(render).getConfigHorarios();
        }

        function handleSaveConfigHorarios(e) {
            e.preventDefault();
            const btn = $('#config-horarios-form button[type="submit"]');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const configs = [
                { clave: 'HORA_ENTRADA_MANANA', valor: $('#cfg-in-manana').val() },
                { clave: 'HORA_SALIDA_MANANA', valor: $('#cfg-out-manana').val() },
                { clave: 'HORA_ENTRADA_TARDE', valor: $('#cfg-in-tarde').val() },
                { clave: 'HORA_SALIDA_TARDE', valor: $('#cfg-out-tarde').val() },
                { clave: 'HORA_ENTRADA_MIXTO', valor: $('#cfg-in-mixto').val() },
                { clave: 'HORA_SALIDA_MIXTO', valor: $('#cfg-out-mixto').val() },
                { clave: 'TOLERANCIA_RETARDO_MIN', valor: $('#cfg-tolerancia').val() }
            ];



            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).saveConfigHorarios(configs, currentUser.userId);
        }

        function handleSetupTriggers() {
            const btn = $('#setup-triggers-btn');
            const orig = btn.html();
            if (!confirm('¿Desea configurar los triggers automáticos de cierre y verificación de asistencia? Esto sobreescribirá triggers existentes.')) return;
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Configurando...');

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                let msg = err ? err.message : 'Desconocido';
                if (msg.includes('ScriptApp') || msg.includes('getProjectTriggers') || msg.includes('scriptapp') || msg.includes('auth/script.scriptapp')) {
                    msg = 'Error de autorización: No tienes permiso para gestionar Triggers automáticos. El propietario o desarrollador del script debe abrir el editor de Google Apps Script y ejecutar manualmente la función "setupAutoCloseTrigger" una vez para conceder la autorización OAuth requerida para el ámbito "script.scriptapp".';
                }
                showNotification('Error', msg, 'danger');
            }).setupAutoCloseTrigger();
        }

        // --- SECCIÓN: TIPOS DE AMONESTACION (ADMIN) ---
        let warningTypesTable = null;
        function initWarningTypesTable() {
            warningTypesTable = $('#warningTypesTable').DataTable({
                data: [],
                columns: [
                    { data: 'tipoId', className: 'dt-center' },
                    { data: 'nombre' },
                    {
                        data: 'gravedad', className: 'dt-center', render: function (d) {
                            let badge = 'secondary';
                            if (d === 'Leve') badge = 'warning';
                            else if (d === 'Moderada') badge = 'orange-badge';
                            else if (d === 'Grave') badge = 'danger';
                            return '<span class="badge badge-' + badge + '">' + d + '</span>';
                        }
                    },
                    {
                        data: 'autoActivar', className: 'dt-center', render: function (d) {
                            return d ? '<span class="text-success"><i class="fas fa-check"></i> Sí</span>' : '<span class="text-muted"><i class="fas fa-times"></i> No</span>';
                        }
                    },
                    { data: 'condicionAuto', render: function (d) { return d || '<span class="text-muted">Manual</span>'; } },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            return d === 'Activo' ? '<span class="badge badge-success">Activo</span>' : '<span class="badge badge-secondary">Inactivo</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            actions += '<button class="btn btn-primary btn-sm edit-warning-type-btn" title="Editar" data-id="' + r.tipoId + '"><i class="fas fa-edit"></i></button>';
                            if (r.estado === 'Activo') {
                                actions += '<button class="btn btn-danger btn-sm delete-warning-type-btn" title="Desactivar" data-id="' + r.tipoId + '"><i class="fas fa-trash"></i></button>';
                            }
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                searching: false,
                lengthChange: false,
                info: false
            });
            populateWarningTypesTable();
        }

        function populateWarningTypesTable() {
            if (!warningTypesTable) return;
            $('#warningTypesTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (types) {
                warningTypesTable.clear().rows.add(types).draw();
            }).getTiposAmonestacion();
        }

        function handleEditWarningType() {
            const id = $(this).data('id');
            const tableData = warningTypesTable.rows().data().toArray();
            const row = tableData.find(r => r.tipoId === id);
            if (!row) return;

            $('#form-warning-type-id').val(row.tipoId);
            $('#form-warning-type-name').val(row.nombre);
            $('#form-warning-type-desc').val(row.descripcion);
            $('#form-warning-type-gravedad').val(row.gravedad);
            $('#form-warning-type-status').val(row.estado);

            const isAuto = row.autoActivar;
            $('#form-warning-type-auto').prop('checked', isAuto);
            if (isAuto) {
                $('#auto-condition-wrapper').show();
                $('#form-warning-type-condicion').val(row.condicionAuto);
            } else {
                $('#auto-condition-wrapper').hide();
                $('#form-warning-type-condicion').val('');
            }

            $('#warning-type-modal-title').html('<i class="fas fa-tag mr-1"></i> Editar Tipo de Amonestación');
            $('#warningTypeModal').modal('show');
        }

        function handleSaveWarningType(e) {
            e.preventDefault();
            const btn = $('#save-warning-type-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                tipoId: $('#form-warning-type-id').val(),
                nombre: $('#form-warning-type-name').val(),
                descripcion: $('#form-warning-type-desc').val(),
                gravedad: $('#form-warning-type-gravedad').val(),
                estado: $('#form-warning-type-status').val(),
                autoActivar: $('#form-warning-type-auto').is(':checked'),
                condicionAuto: $('#form-warning-type-auto').is(':checked') ? $('#form-warning-type-condicion').val() : ''
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#warningTypeModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateWarningTypesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).saveTipoAmonestacion(data, currentUser.userId);
        }

        function handleDeleteWarningType() {
            const id = $(this).data('id');
            if (!confirm('¿Seguro de desactivar este tipo de amonestación?')) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateWarningTypesTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).deleteTipoAmonestacion(id, currentUser.userId);
        }

        // --- SECCIÓN: SOLICITUDES DE ANULACIÓN (ADMIN) ---
        let adminAnulacionesTable = null;
        function initAdminAnulacionesTable() {
            adminAnulacionesTable = $('#adminAnulacionesTable').DataTable({
                data: [],
                columns: [
                    { data: 'fechaSolicitud', className: 'dt-center' },
                    { data: 'amonestacionId', className: 'dt-center' },
                    { data: 'coordinadorNombre' },
                    { data: 'motivo' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            let actions = '<div class="btn-group">';
                            actions += '<button class="btn btn-success btn-sm approve-wanul-btn mr-1" title="Aprobar y Anular" data-id="' + r.solicitudId + '"><i class="fas fa-check"></i></button>';
                            actions += '<button class="btn btn-danger btn-sm reject-wanul-btn" title="Rechazar" data-id="' + r.solicitudId + '"><i class="fas fa-times"></i></button>';
                            actions += '</div>';
                            return actions;
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                searching: false,
                lengthChange: false,
                info: false
            });
            populateAdminAnulacionesTable();
        }

        function populateAdminAnulacionesTable() {
            if (!adminAnulacionesTable) return;
            $('#adminAnulacionesTable tbody').html('<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (reqs) {
                adminAnulacionesTable.clear().rows.add(reqs).draw();
            }).getAnulacionesPendientes();
        }

        function handleResolveWarningAnulacion(btn, decision) {
            const id = $(btn).data('id');
            const rowData = adminAnulacionesTable.rows().data().toArray().find(r => r.solicitudId === id);
            if (!rowData) return;

            $('#resolve-wanul-id').val(rowData.solicitudId);
            $('#resolve-wanul-amon-id').text(rowData.amonestacionId);
            $('#resolve-wanul-coord').text(rowData.coordinadorNombre);
            $('#resolve-wanul-motivo').text(rowData.motivo);
            $('#resolve-wanul-nota').val('');

            $('#resolveWarningAnulacionModal').modal('show');

            // Setup actions inside modal
            $('#resolve-wanul-approve-btn').off('click').on('click', function () {
                submitResolveWarningAnulacion(id, 'Aprobada');
            });
            $('#resolve-wanul-reject-btn').off('click').on('click', function () {
                submitResolveWarningAnulacion(id, 'Rechazada');
            });
        }

        function submitResolveWarningAnulacion(solicitudId, decision) {
            const note = $('#resolve-wanul-nota').val().trim();
            const modalBtn = decision === 'Aprobada' ? $('#resolve-wanul-approve-btn') : $('#resolve-wanul-reject-btn');
            const orig = modalBtn.html();

            modalBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                modalBtn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#resolveWarningAnulacionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateAdminAnulacionesTable();
                    populateAdminWarningsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                modalBtn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).resolverAnulacion({ solicitudId: solicitudId, decision: decision, nota: note }, currentUser.userId);
        }

        // --- SECCIÓN: REGISTRO GENERAL DE AMONESTACIONES (ADMIN) ---
        let adminWarningsTable = null;
        function initAdminWarningsTable() {
            adminWarningsTable = $('#adminWarningsTable').DataTable({
                data: [],
                columns: [
                    { data: 'amonestacionId', className: 'dt-center' },
                    { data: 'fecha', className: 'dt-center' },
                    { data: 'userName' },
                    { data: 'tipoNombre' },
                    {
                        data: null, className: 'dt-center', render: function (r) {
                            return '<span class="badge badge-secondary" id="severity-' + r.amonestacionId + '">Leve</span>';
                        }
                    },
                    { data: 'descripcion' },
                    { data: 'creadoPorNombre' },
                    {
                        data: 'origen', className: 'dt-center', render: function (d) {
                            return d === 'Automática' ? '<span class="badge badge-info"><i class="fas fa-robot"></i> Auto</span>' : '<span class="badge badge-dark"><i class="fas fa-user"></i> Manual</span>';
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            return d === 'Activa' ? '<span class="badge badge-danger">Activa</span>' : '<span class="badge badge-secondary">Anulada</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            if (r.estado === 'Activa') {
                                return '<button class="btn btn-secondary btn-sm anular-warning-btn" title="Anular Amonestación" data-id="' + r.amonestacionId + '"><i class="fas fa-undo"></i> Anular</button>';
                            }
                            return '<span class="small text-muted">Anulada</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                order: [[1, 'desc']],
                drawCallback: function (settings) {
                    google.script.run.withSuccessHandler(function (types) {
                        const typeMap = {};
                        types.forEach(t => { typeMap[t.tipoId] = t.gravedad; });
                        const api = settings.oInstance.api();
                        api.rows().every(function (rowIdx, tableLoop, rowLoop) {
                            const data = this.data();
                            const grav = typeMap[data.tipoId] || 'Leve';
                            let badge = 'secondary';
                            if (grav === 'Leve') badge = 'warning';
                            else if (grav === 'Moderada') badge = 'orange-badge';
                            else if (grav === 'Grave') badge = 'danger';
                            $('#severity-' + data.amonestacionId).removeClass('badge-secondary').addClass('badge-' + badge).text(grav);
                        });
                    }).getTiposAmonestacion();
                }
            });
            populateAdminWarningsTable();
        }

        function populateAdminWarningsTable() {
            if (!adminWarningsTable) return;
            $('#adminWarningsTable tbody').html('<tr><td colspan="10" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');

            const filters = {
                userId: $('#warning-filter-user').val(),
                estado: $('#warning-filter-status').val()
            };

            google.script.run.withSuccessHandler(function (warnings) {
                adminWarningsTable.clear().rows.add(warnings).draw();
            }).getAmonestaciones(filters);
        }

        function handleSaveAdminWarning(e) {
            e.preventDefault();
            const btn = $('#save-admin-warning-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                userId: $('#form-admin-warning-user').val(),
                tipoId: $('#form-admin-warning-type').val(),
                descripcion: $('#form-admin-warning-desc').val().trim()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#adminCreateWarningModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateAdminWarningsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).crearAmonestacion(data, currentUser.userId);
        }

        function handleAnularWarning() {
            const id = $(this).data('id');
            const note = prompt('Ingrese una justificación o motivo para anular esta amonestación:');
            if (note === null) return;

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    populateAdminWarningsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).anularAmonestacion(id, currentUser.userId, note);
        }

        // --- SECCIÓN: AMONESTACIONES PARA COORDINADORES ---
        let coordWarningsTable = null;
        function initCoordWarningsTable() {
            coordWarningsTable = $('#coordWarningsTable').DataTable({
                data: [],
                columns: [
                    { data: 'amonestacionId', className: 'dt-center' },
                    { data: 'fecha', className: 'dt-center' },
                    { data: 'userName' },
                    { data: 'tipoNombre' },
                    {
                        data: null, className: 'dt-center', render: function (r) {
                            return '<span class="badge badge-secondary" id="coord-severity-' + r.amonestacionId + '">Leve</span>';
                        }
                    },
                    { data: 'descripcion' },
                    { data: 'creadoPorNombre' },
                    {
                        data: 'origen', className: 'dt-center', render: function (d) {
                            return d === 'Automática' ? '<span class="badge badge-info"><i class="fas fa-robot"></i> Auto</span>' : '<span class="badge badge-dark"><i class="fas fa-user"></i> Manual</span>';
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            return d === 'Activa' ? '<span class="badge badge-danger">Activa</span>' : '<span class="badge badge-secondary">Anulada</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            if (r.estado === 'Activa') {
                                return '<button class="btn btn-warning btn-sm coord-request-anul-btn" title="Solicitar Anulación" data-id="' + r.amonestacionId + '"><i class="fas fa-undo"></i> Solicitar Anulación</button>';
                            }
                            return '<span class="small text-muted">Resuelta</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                order: [[1, 'desc']],
                drawCallback: function (settings) {
                    google.script.run.withSuccessHandler(function (types) {
                        const typeMap = {};
                        types.forEach(t => { typeMap[t.tipoId] = t.gravedad; });
                        const api = settings.oInstance.api();
                        api.rows().every(function (rowIdx, tableLoop, rowLoop) {
                            const data = this.data();
                            const grav = typeMap[data.tipoId] || 'Leve';
                            let badge = 'secondary';
                            if (grav === 'Leve') badge = 'warning';
                            else if (grav === 'Moderada') badge = 'orange-badge';
                            else if (grav === 'Grave') badge = 'danger';
                            $('#coord-severity-' + data.amonestacionId).removeClass('badge-secondary').addClass('badge-' + badge).text(grav);
                        });
                    }).getTiposAmonestacion();
                }
            });
            populateCoordWarningsTable();
        }

        function populateCoordWarningsTable() {
            if (!coordWarningsTable) return;
            $('#coordWarningsTable tbody').html('<tr><td colspan="10" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.warnings) {
                coordWarningsTable.clear().rows.add(cachedCoordinatorData.warnings).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (warnings) {
                if (cachedCoordinatorData) cachedCoordinatorData.warnings = warnings;
                coordWarningsTable.clear().rows.add(warnings).draw();
            }).getAmonestacionesForCoordinator(currentUser.areas);
        }

        function handleSaveCoordWarning(e) {
            e.preventDefault();
            const btn = $('#save-coord-warning-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                userId: $('#form-coord-warning-user').val(),
                tipoId: $('#form-coord-warning-type').val(),
                descripcion: $('#form-coord-warning-desc').val().trim()
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#coordCreateWarningModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateCoordWarningsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).crearAmonestacion(data, currentUser.userId);
        }

        function handleShowCoordRequestAnulacionModal() {
            const id = $(this).data('id');
            $('#coord-anul-amon-id').val(id);
            $('#coord-anul-amon-display').text(id);
            $('#coord-anul-motivo').val('');
            $('#coordRequestAnulacionModal').modal('show');
        }

        // solic_anul
        function handleSaveCoordRequestAnulacion(e) {
            e.preventDefault();
            const btn = $('#submit-coord-anul-btn');
            const orig = btn.html();
            const motivo = $('#coord-anul-motivo').val().trim();
            if (!motivo) return;

            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            const data = {
                amonestacionId: $('#coord-anul-amon-id').val(),
                motivo: motivo
            };

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#coordRequestAnulacionModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');
                    populateCoordWarningsTable();
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).solicitarAnulacionAmonestacion(data, currentUser.userId);
        }

        // --- SECCIÓN: AMONESTACIONES PARA USUARIO DE SOLO LECTURA ---
        let userWarningsTable = null;
        function initUserWarningsTable() {
            userWarningsTable = $('#userWarningsTable').DataTable({
                data: [],
                columns: [
                    { data: 'fecha', className: 'dt-center' },
                    { data: 'tipoNombre' },
                    {
                        data: null, className: 'dt-center', render: function (r) {
                            return '<span class="badge badge-secondary" id="user-severity-' + r.amonestacionId + '">Leve</span>';
                        }
                    },
                    { data: 'descripcion' },
                    {
                        data: 'origen', className: 'dt-center', render: function (d) {
                            return d === 'Automática' ? '<span class="badge badge-info"><i class="fas fa-robot"></i> Auto</span>' : '<span class="badge badge-dark"><i class="fas fa-user"></i> Manual</span>';
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            return d === 'Activa' ? '<span class="badge badge-danger">Activa</span>' : '<span class="badge badge-secondary">Anulada</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                order: [[0, 'desc']],
                searching: false,
                lengthChange: false,
                drawCallback: function (settings) {
                    google.script.run.withSuccessHandler(function (types) {
                        const typeMap = {};
                        types.forEach(t => { typeMap[t.tipoId] = t.gravedad; });
                        const api = settings.oInstance.api();
                        api.rows().every(function (rowIdx, tableLoop, rowLoop) {
                            const data = this.data();
                            const grav = typeMap[data.tipoId] || 'Leve';
                            let badge = 'secondary';
                            if (grav === 'Leve') badge = 'warning';
                            else if (grav === 'Moderada') badge = 'orange-badge';
                            else if (grav === 'Grave') badge = 'danger';
                            $('#user-severity-' + data.amonestacionId).removeClass('badge-secondary').addClass('badge-' + badge).text(grav);
                        });
                    }).getTiposAmonestacion();
                }
            });
            populateUserWarningsTable();
        }

        function populateUserWarningsTable() {
            if (!userWarningsTable) return;
            $('#userWarningsTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedUserData && cachedUserData.warnings) {
                userWarningsTable.clear().rows.add(cachedUserData.warnings).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (warnings) {
                if (cachedUserData) cachedUserData.warnings = warnings;
                userWarningsTable.clear().rows.add(warnings).draw();
            }).getAmonestaciones({ userId: currentUser.userId });
        }

        // =======================================================
        // ============= GESTIÓN DE HORARIOS DE CLASE ============
        // =======================================================

        let tempSchedSlots = [];

        function handleAddSchedSlot() {
            const day = $('#sched-slot-day').val();
            const start = $('#sched-slot-start').val();
            const end = $('#sched-slot-end').val();

            if (!day || !start || !end) {
                showNotification('Atención', 'Seleccione el día y las horas de inicio y fin.', 'warning');
                return;
            }
            if (start >= end) {
                showNotification('Atención', 'La hora de inicio debe ser anterior a la de fin.', 'warning');
                return;
            }

            const exists = tempSchedSlots.some(s => s.day === day && s.start === start && s.end === end);
            if (exists) {
                showNotification('Atención', 'Este bloque ya ha sido agregado.', 'warning');
                return;
            }

            tempSchedSlots.push({ day: day, start: start, end: end });
            renderTempSchedSlots();

            $('#sched-slot-start, #sched-slot-end').val('');
        }

        function handleRemoveSchedSlot() {
            const idx = $(this).data('index');
            tempSchedSlots.splice(idx, 1);
            renderTempSchedSlots();
        }

        function renderTempSchedSlots() {
            const tbody = $('#sched-slots-temp-body');
            tbody.empty();
            if (tempSchedSlots.length === 0) {
                tbody.html('<tr><td colspan="4" class="text-muted small">No hay bloques agregados.</td></tr>');
                return;
            }
            tempSchedSlots.forEach((slot, idx) => {
                tbody.append(
                    '<tr>' +
                    '<td>' + slot.day + '</td>' +
                    '<td>' + slot.start + '</td>' +
                    '<td>' + slot.end + '</td>' +
                    '<td><button type="button" class="btn btn-danger btn-xs remove-slot-btn" data-index="' + idx + '" title="Eliminar"><i class="fas fa-trash-alt"></i></button></td>' +
                    '</tr>'
                );
            });
        }

        function handleUploadSchedule(e) {
            e.preventDefault();

            const fileInput = document.getElementById('sched-image-file');
            const file = fileInput.files[0];
            if (!file) {
                showNotification('Atención', 'Debe seleccionar una imagen de comprobante.', 'warning');
                return;
            }
            if (tempSchedSlots.length === 0) {
                showNotification('Atención', 'Debe cargar al menos un bloque de clases en la grilla manual.', 'warning');
                return;
            }

            const btn = $('#submit-schedule-btn');
            const orig = btn.html();
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Enviando...');

            const reader = new FileReader();
            reader.onload = function (event) {
                const dataUrl = event.target.result;
                const base64Data = dataUrl.split(',')[1];
                const mimeType = file.type;
                const filename = file.name;

                const slotsJson = JSON.stringify(tempSchedSlots.map(s => ({
                    dia: s.day,
                    inicio: s.start,
                    fin: s.end
                })));

                const payload = {
                    userId: currentUser.userId,
                    base64Image: base64Data,
                    filename: filename,
                    mimeType: mimeType,
                    slotsJson: slotsJson
                };

                google.script.run.withSuccessHandler(function (res) {
                    btn.prop('disabled', false).html(orig);
                    if (res.success) {
                        showNotification('Éxito', res.message, 'success');
                        $('#upload-schedule-form')[0].reset();
                        $('#sched-img-preview-container').hide();
                        $('#sched-img-preview').attr('src', '');
                        $('#sched-image-file').next('.custom-file-label').html('Seleccionar imagen...');
                        tempSchedSlots = [];
                        renderTempSchedSlots();

                        cachedUserData.schedulesHistory = null;
                        populateUserSchedulesTable();
                    } else {
                        showNotification('Error', res.message, 'danger');
                    }
                }).withFailureHandler(function (err) {
                    btn.prop('disabled', false).html(orig);
                    showNotification('Error', err.message, 'danger');
                }).submitUserSchedule(payload);
            };
            reader.readAsDataURL(file);
        }

        let userSchedulesTable = null;
        function initUserSchedulesTable() {
            userSchedulesTable = $('#userSchedulesTable').DataTable({
                data: [],
                columns: [
                    { data: 'fechaSolicitud', className: 'dt-center' },
                    {
                        data: 'imagenUrl', className: 'dt-center', render: function (d) {
                            if (d) {
                                return '<img src="' + getSafeDriveImageUrl(d) + '" class="clickable-photo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;">';
                            }
                            return 'Sin imagen';
                        }
                    },
                    {
                        data: 'cargaHoraria', render: function (d) {
                            if (!d || d.length === 0) return 'Ninguna';
                            return d.map(slot => '<span class="badge badge-light font-weight-bold m-1">' + (slot.dia || slot.day) + ': ' + slot.inicio + '-' + slot.fin + '</span>').join('');
                        }
                    },
                    {
                        data: 'tiempoGracia', className: 'dt-center', render: function (d) {
                            return (d !== undefined && d !== null ? d : 0) + ' min';
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Pendiente') b = 'warning';
                            else if (d === 'Pre-Aprobado') b = 'info';
                            else if (d === 'Aprobado') b = 'success';
                            else if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: 'notaAdmin', render: function (d) {
                            return d || '<span class="text-muted small">Sin notas</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateUserSchedulesTable();
        }

        function populateUserSchedulesTable() {
            if (!userSchedulesTable) return;
            $('#userSchedulesTable tbody').html('<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedUserData && cachedUserData.schedulesHistory) {
                userSchedulesTable.clear().rows.add(cachedUserData.schedulesHistory).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedUserData) cachedUserData.schedulesHistory = d;
                userSchedulesTable.clear().rows.add(d).draw();
            }).getSchedulesHistory(currentUser.userId);
        }

        let coordSchedulesTable = null;
        function initCoordSchedulesTable() {
            coordSchedulesTable = $('#coordSchedulesTable').DataTable({
                data: [],
                columns: [
                    { data: 'fechaSolicitud', className: 'dt-center' },
                    { data: 'userName' },
                    { data: 'userAreas', className: 'dt-center' },
                    {
                        data: 'imagenUrl', className: 'dt-center', render: function (d) {
                            if (d) {
                                return '<img src="' + getSafeDriveImageUrl(d) + '" class="clickable-photo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;">';
                            }
                            return 'Sin imagen';
                        }
                    },
                    {
                        data: 'cargaHoraria', render: function (d) {
                            if (!d || d.length === 0) return 'Ninguna';
                            return d.map(slot => '<span class="badge badge-light font-weight-bold m-1">' + (slot.dia || slot.day) + ': ' + slot.inicio + '-' + slot.fin + '</span>').join('');
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Pendiente') b = 'warning';
                            else if (d === 'Pre-Aprobado') b = 'info';
                            else if (d === 'Aprobado') b = 'success';
                            else if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            if (r.estado === 'Pendiente') {
                                return '<button class="btn btn-primary btn-sm validate-schedule-btn" data-id="' + r.scheduleId + '"><i class="fas fa-check-circle mr-1"></i> Validar</button>';
                            }
                            return '<span class="text-muted small">Resuelto</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordSchedulesTable();
        }

        function populateCoordSchedulesTable() {
            if (!coordSchedulesTable) return;
            $('#coordSchedulesTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedCoordinatorData && cachedCoordinatorData.schedules) {
                coordSchedulesTable.clear().rows.add(cachedCoordinatorData.schedules).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedCoordinatorData) cachedCoordinatorData.schedules = d;
                coordSchedulesTable.clear().rows.add(d).draw();
            }).getPendingSchedules(currentUser.areas);
        }

        let adminSchedulesTable = null;
        function initAdminSchedulesTable() {
            adminSchedulesTable = $('#adminSchedulesTable').DataTable({
                data: [],
                columns: [
                    { data: 'fechaSolicitud', className: 'dt-center' },
                    { data: 'userName' },
                    { data: 'userAreas', className: 'dt-center' },
                    {
                        data: 'imagenUrl', className: 'dt-center', render: function (d) {
                            if (d) {
                                return '<img src="' + getSafeDriveImageUrl(d) + '" class="clickable-photo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;">';
                            }
                            return 'Sin imagen';
                        }
                    },
                    {
                        data: 'cargaHoraria', render: function (d) {
                            if (!d || d.length === 0) return 'Ninguna';
                            return d.map(slot => '<span class="badge badge-light font-weight-bold m-1">' + (slot.dia || slot.day) + ': ' + slot.inicio + '-' + slot.fin + '</span>').join('');
                        }
                    },
                    {
                        data: 'estado', className: 'dt-center', render: function (d) {
                            let b = 'secondary';
                            if (d === 'Pendiente') b = 'warning';
                            else if (d === 'Pre-Aprobado') b = 'info';
                            else if (d === 'Aprobado') b = 'success';
                            else if (d === 'Rechazado') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            if (r.estado === 'Pendiente' || r.estado === 'Pre-Aprobado') {
                                return '<button class="btn btn-primary btn-sm validate-schedule-btn" data-id="' + r.scheduleId + '"><i class="fas fa-check-circle mr-1"></i> Validar</button>';
                            }
                            return '<span class="text-muted small">Resuelto</span>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAdminSchedulesTable();
        }

        function populateAdminSchedulesTable() {
            if (!adminSchedulesTable) return;
            $('#adminSchedulesTable tbody').html('<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            if (cachedAdminData && cachedAdminData.schedules) {
                adminSchedulesTable.clear().rows.add(cachedAdminData.schedules).draw();
                return;
            }
            google.script.run.withSuccessHandler(function (d) {
                if (cachedAdminData) cachedAdminData.schedules = d;
                adminSchedulesTable.clear().rows.add(d).draw();
            }).getPendingSchedules('admin');
        }

        // --- Listeners y Controladores para la Validación de Horarios ---
        $(document).on('click', '.validate-schedule-btn', function () {
            const id = $(this).data('id');
            let sched = null;

            const subRolNorm = normalizeSubRol(currentUser.subRol);
            const isAdmin = (currentUser.role === 'Admin' || subRolNorm === 'coordinador general' || subRolNorm === 'superadmin');

            if (isAdmin && cachedAdminData && cachedAdminData.schedules) {
                sched = cachedAdminData.schedules.find(s => s.scheduleId === id);
            } else if (cachedCoordinatorData && cachedCoordinatorData.schedules) {
                sched = cachedCoordinatorData.schedules.find(s => s.scheduleId === id);
            }

            if (!sched) return showNotification('Error', 'No se pudieron encontrar los detalles de la solicitud.', 'danger');

            $('#resolve-schedule-id').val(sched.scheduleId);
            $('#resolve-schedule-img').attr('src', getSafeDriveImageUrl(sched.imagenUrl));
            $('#resolve-schedule-link').attr('href', sched.imagenUrl);
            $('#resolve-schedule-grace').val(sched.tiempoGracia || 30);
            $('#resolve-schedule-comment').val('');

            const slotsBody = $('#resolve-schedule-slots-body').empty();
            if (sched.cargaHoraria && sched.cargaHoraria.length > 0) {
                sched.cargaHoraria.forEach(slot => {
                    slotsBody.append(
                        '<tr>' +
                        '<td>' + (slot.dia || slot.day) + '</td>' +
                        '<td>' + slot.inicio + '</td>' +
                        '<td>' + slot.fin + '</td>' +
                        '</tr>'
                    );
                });
            } else {
                slotsBody.html('<tr><td colspan="3" class="text-muted text-center small">Sin bloques</td></tr>');
            }

            $('#resolveScheduleModal').modal('show');
        });

        function handleResolveScheduleSubmit(e) {
            e.preventDefault();
            resolveScheduleAction('Aprobada');
        }

        function handleResolveScheduleReject() {
            if (!confirm('¿Seguro de rechazar esta solicitud de horario?')) return;
            resolveScheduleAction('Rechazada');
        }

        function resolveScheduleAction(decision) {
            const scheduleId = $('#resolve-schedule-id').val();
            const grace = $('#resolve-schedule-grace').val();
            const comment = $('#resolve-schedule-comment').val().trim();

            if (decision === 'Aprobada' && (!grace || isNaN(grace) || parseInt(grace, 10) < 0)) {
                showNotification('Atención', 'El tiempo de gracia es obligatorio y debe ser un número válido.', 'warning');
                return;
            }

            const btnApprove = $('#resolve-schedule-approve-btn');
            const btnReject = $('#resolve-schedule-reject-btn');
            const origApprove = btnApprove.html();
            const origReject = btnReject.html();

            btnApprove.prop('disabled', true);
            btnReject.prop('disabled', true);
            if (decision === 'Aprobada') {
                btnApprove.html('<i class="fas fa-spinner fa-spin mr-1"></i> Procesando...');
            } else {
                btnReject.html('<i class="fas fa-spinner fa-spin mr-1"></i> Procesando...');
            }

            google.script.run.withSuccessHandler(function (res) {
                btnApprove.prop('disabled', false).html(origApprove);
                btnReject.prop('disabled', false).html(origReject);

                if (res.success) {
                    $('#resolveScheduleModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');

                    const subRolNorm = normalizeSubRol(currentUser.subRol);
                    const isAdmin = (currentUser.role === 'Admin' || subRolNorm === 'coordinador general' || subRolNorm === 'superadmin');
                    if (isAdmin) {
                        loadAdminDashboard();
                    } else {
                        loadCoordinadorDashboard();
                    }
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                btnApprove.prop('disabled', false).html(origApprove);
                btnReject.prop('disabled', false).html(origReject);
                showNotification('Error', err.message, 'danger');
            }).resolveSchedule(scheduleId, decision, currentUser.userId, comment, grace);
        }

        $(document).on('submit', '#resolve-schedule-form', handleResolveScheduleSubmit);
        $(document).on('click', '#resolve-schedule-reject-btn', handleResolveScheduleReject);

        // =======================================================
        // ============= GESTIÓN DE MODAL ASISTENCIA =============
        // =======================================================
        let modalUserTable = null;
        let modalHtml5QrCode = null;
        let activeModalScanType = null;

        function openPersonalAttendanceModal() {
            $('#personalAttendanceModal').modal('show');
        }

        function initPersonalAttendanceModal() {
            $('#personalAttendanceModal').on('shown.bs.modal', function () {
                if (!modalUserTable) {
                    modalUserTable = $("#modalUserAttendanceTable").DataTable({
                        data: [],
                        columns: [
                            { data: "timestamp" },
                            { data: "type", render: function (t) { return '<span class="badge badge-pill badge-' + (t === "Entrada" ? "success" : "danger") + '">' + t + '</span>'; } },
                            { data: "status", render: function (t) { return '<span class="badge badge-' + (t === "Correcto" ? "primary" : "warning") + '">' + t + '</span>'; } },
                            { data: "distance" }
                        ],
                        order: [[0, "desc"]],
                        language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" },
                        pageLength: 5,
                        lengthMenu: [5, 10, 25]
                    });
                }
                populateModalUserTable();
                updateModalStatus();
            });

            $('#personalAttendanceModal').on('hidden.bs.modal', function () {
                stopModalScanner();
            });

            $("#modal-scan-check-in").off("click").on("click", () => startModalScanner("Entrada"));
            $("#modal-scan-check-out").off("click").on("click", () => startModalScanner("Salida"));
            $("#modal-stop-scan-button").off("click").on("click", stopModalScanner);
            $("#modal-refresh-table-button").off("click").on("click", function () {
                populateModalUserTable(true);
            });

        }

        function updateModalStatus() {
            $("#modal-user-status-display").html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Cargando...');
            google.script.run.withSuccessHandler(updateModalUIBasedOnState).withFailureHandler(function () {
                $("#modal-user-status-display").html('Estado: <span class="text-secondary font-weight-bold">DESCONOCIDO</span>');
            }).getLastAttendanceState(currentUser.userId);
        }

        function updateModalUIBasedOnState(s) {
            let i = $("#modal-scan-check-in"), o = $("#modal-scan-check-out"), d = $("#modal-user-status-display");
            if (s && "Entrada" === s.type) {
                d.html('Estado: <span class="text-success font-weight-bold">DENTRO</span>');
                i.prop("disabled", true);
                o.prop("disabled", false);
            } else {
                d.html('Estado: <span class="text-danger font-weight-bold">FUERA</span>');
                i.prop("disabled", false);
                o.prop("disabled", true);
            }
        }

        function populateModalUserTable(forceReload = false) {
            $("#modalUserAttendanceTable tbody").html('<tr><td colspan="4" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');
            google.script.run.withSuccessHandler(function (r) {
                if (modalUserTable) {
                    modalUserTable.clear().rows.add(r).draw();
                }
            }).withFailureHandler(function () {
                if (modalUserTable) {
                    modalUserTable.clear().draw();
                }
            }).getAttendanceRecords(currentUser.userId);
        }

        function startModalScanner(type) {
            activeModalScanType = type;
            $("#modal-action-buttons").hide();
            $("#modal-qr-scanner-container, #modal-stop-scan-button").show();

            if (modalHtml5QrCode) {
                try {
                    if (modalHtml5QrCode.isScanning) {
                        modalHtml5QrCode.stop().catch(function () { });
                    }
                    modalHtml5QrCode.clear();
                } catch (e) { }
                modalHtml5QrCode = null;
            }

            try {
                modalHtml5QrCode = new Html5Qrcode("modal-qr-reader");
                modalHtml5QrCode.start(
                    { facingMode: "environment" },
                    { fps: 10, qrbox: { width: 200, height: 200 } },
                    function (qr) {
                        stopModalScanner();
                        try {
                            let d = JSON.parse(qr);
                            if (d.id && d.id === masterQRId) {
                                playSuccessBeep();
                                processModalAttendanceDirect(type);
                            } else {
                                $("#modal-scan-spinner").show();
                                onModalRecordFailure({ message: "QR no reconocido. Asegúrese de escanear el código oficial de la sede." });
                            }
                        } catch (e) {
                            $("#modal-scan-spinner").show();
                            onModalRecordFailure({ message: "Error al leer QR: formato no válido." });
                        }
                    }
                ).catch(function (err) {
                    console.error("Error al iniciar cámara modal:", err);
                    showNotification("Error de Cámara", "No se pudo acceder a la cámara. Asegúrese de conceder los permisos en el navegador.", "error");
                    stopModalScanner();
                });
            } catch (err) {
                console.error("Error al instanciar Html5Qrcode modal:", err);
                showNotification("Error de Cámara", "Error al iniciar el escáner modal.", "error");
                stopModalScanner();
            }
        }

        // processModalGeolocation() eliminada en v2.0 — GPS ya no es requerido.

        // Asegurarse de que también funcione al presionar el botón de cerrar de la barra del modal
        $(document).on('click', '#close-modal-attendance-btn', stopModalScanner);

        function stopModalScanner() {
            if (modalHtml5QrCode) {
                if (modalHtml5QrCode.isScanning) {
                    modalHtml5QrCode.stop().then(function () {
                        try { modalHtml5QrCode.clear(); } catch (e) { }
                        modalHtml5QrCode = null;
                    }).catch(function (err) {
                        console.error("Error al detener scanner modal:", err);
                        try { modalHtml5QrCode.clear(); } catch (e) { }
                        modalHtml5QrCode = null;
                    });
                } else {
                    try { modalHtml5QrCode.clear(); } catch (e) { }
                    modalHtml5QrCode = null;
                }
            }
            $("#modal-qr-scanner-container, #modal-stop-scan-button, #modal-scan-spinner").hide();
            $("#modal-action-buttons").show();
            activeModalScanType = null;
        }

        function onModalRecordSuccess(r) {
            $("#modal-scan-spinner").hide();
            $("#modal-action-buttons").show();
            if (r.success) {
                if (navigator.vibrate) navigator.vibrate(200);
                showNotification("Éxito", r.message, "success");
                populateModalUserTable(true);
                updateModalStatus();
                if (typeof populateUserTable === 'function' && userTable) {
                    if (cachedUserData) {
                        cachedUserData.attendance = null;
                    }
                    populateUserTable();
                }
                if (typeof populateAdminAttendanceTable === 'function' && adminTable) {
                    if (cachedAdminData) {
                        cachedAdminData.attendance = null;
                        cachedAdminData.stats = null;
                        cachedAdminData.openSessions = null;
                        cachedAdminData.absentees = null;
                    }
                    populateAdminAttendanceTable();
                    populateOpenSessions();
                    populateTodaysAbsentees();
                    updateAdminView();
                }
                if (typeof populateCoordAttendanceTable === 'function' && coordAttendanceTable) {
                    if (cachedCoordinatorData) {
                        cachedCoordinatorData.attendance = null;
                        cachedCoordinatorData.stats = null;
                    }
                    populateCoordAttendanceTable();
                    updateCoordStats();
                }
                if (typeof updateUIBasedOnState === 'function') {
                    google.script.run.withSuccessHandler(updateUIBasedOnState).getLastAttendanceState(currentUser.userId);
                }
            } else {
                showNotification("Denegado", r.message, "warning");
            }
        }

        function onModalRecordFailure(e) {
            $("#modal-scan-spinner").hide();
            $("#modal-action-buttons").show();
            showNotification("Error", "No se pudo procesar: " + (e.message || "Desconocido"), "error");
        }

        // =======================================================
        // ============= DESCARGA DE HISTORIAL EXCEL =============
        // =======================================================
        function handleDownloadFullUserHistory(btnId) {
            const $btn = $(btnId);
            const origHtml = $btn.html();
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Descargando...');

            google.script.run.withSuccessHandler(function (records) {
                $btn.prop('disabled', false).html(origHtml);
                if (!records || records.length === 0) {
                    showNotification('Atención', 'No se encontraron registros de asistencia para exportar.', 'warning');
                    return;
                }

                const $tempTable = $('<table style="display:none;"><thead><tr><th>Fecha y Hora</th><th>ID Usuario</th><th>Nombre</th><th>Turno</th><th>Institución</th><th>Tipo</th><th>Estado</th><th>Distancia (m)</th></tr></thead><tbody></tbody></table>');
                $('body').append($tempTable);

                records.forEach(r => {
                    $tempTable.find('tbody').append(`<tr>
                    <td>${r.timestamp}</td>
                    <td>${r.userId}</td>
                    <td>${r.name}</td>
                    <td>${r.turno}</td>
                    <td>${r.institucion}</td>
                    <td>${r.type}</td>
                    <td>${r.status}</td>
                    <td>${r.distance}</td>
                </tr>`);
                });

                const nameClean = String(currentUser.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
                const dt = $tempTable.DataTable({
                    dom: 'B',
                    buttons: [
                        {
                            extend: 'excelHtml5',
                            title: `Historial de Asistencia - ${currentUser.name}`,
                            filename: `Historial_Asistencia_${nameClean}`
                        }
                    ]
                });

                dt.button(0).trigger();
                dt.destroy();
                $tempTable.remove();
                showNotification('Éxito', 'Descarga de historial iniciada.', 'success');
            }).withFailureHandler(function (err) {
                $btn.prop('disabled', false).html(origHtml);
                showNotification('Error', 'Fallo al descargar historial: ' + err.message, 'danger');
            }).getFullUserAttendanceRecords(currentUser.userId);
        }

        // =======================================================
        // === TABLAS DE GESTIÓN DE HORARIOS APROBADOS ===========
        // =======================================================
        let adminApprovedSchedulesTable = null;
        function initAdminApprovedSchedulesTable() {
            adminApprovedSchedulesTable = $('#adminApprovedSchedulesTable').DataTable({
                data: [],
                columns: [
                    { data: 'userName' },
                    { data: 'userAreas', className: 'dt-center' },
                    {
                        data: 'imagenUrl', className: 'dt-center', render: function (d) {
                            if (d) {
                                return '<img src="' + getSafeDriveImageUrl(d) + '" class="clickable-photo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;">';
                            }
                            return 'Sin imagen';
                        }
                    },
                    {
                        data: 'cargaHoraria', render: function (d) {
                            if (!d || d.length === 0) return 'Ninguna';
                            return d.map(slot => '<span class="badge badge-light font-weight-bold m-1">' + (slot.dia || slot.day) + ': ' + slot.inicio + '-' + slot.fin + '</span>').join('');
                        }
                    },
                    { data: 'fechaResolucion', className: 'dt-center' },
                    { data: 'tiempoGracia', className: 'dt-center', render: function (d) { return '<b>' + d + ' min</b>'; } },
                    { data: 'notaAdmin' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return '<button class="btn btn-sm btn-success edit-approved-sched-btn" data-id="' + r.scheduleId + '" data-username="' + r.userName + '" data-grace="' + r.tiempoGracia + '" data-notes="' + (r.notaAdmin || '') + '"><i class="fas fa-edit"></i> Modificar</button>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAdminApprovedSchedulesTable();
        }

        function populateAdminApprovedSchedulesTable(forceReload = false) {
            if (!adminApprovedSchedulesTable) return;
            $('#adminApprovedSchedulesTable tbody').html('<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');

            if (!forceReload && cachedAdminData && cachedAdminData.approvedSchedules) {
                adminApprovedSchedulesTable.clear().rows.add(cachedAdminData.approvedSchedules).draw();
                return;
            }

            google.script.run.withSuccessHandler(function (d) {
                if (cachedAdminData) cachedAdminData.approvedSchedules = d;
                adminApprovedSchedulesTable.clear().rows.add(d).draw();
            }).getApprovedSchedules('admin');
        }

        let coordApprovedSchedulesTable = null;
        function initCoordApprovedSchedulesTable() {
            coordApprovedSchedulesTable = $('#coordApprovedSchedulesTable').DataTable({
                data: [],
                columns: [
                    { data: 'userName' },
                    { data: 'userAreas', className: 'dt-center' },
                    {
                        data: 'imagenUrl', className: 'dt-center', render: function (d) {
                            if (d) {
                                return '<img src="' + getSafeDriveImageUrl(d) + '" class="clickable-photo" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;">';
                            }
                            return 'Sin imagen';
                        }
                    },
                    {
                        data: 'cargaHoraria', render: function (d) {
                            if (!d || d.length === 0) return 'Ninguna';
                            return d.map(slot => '<span class="badge badge-light font-weight-bold m-1">' + (slot.dia || slot.day) + ': ' + slot.inicio + '-' + slot.fin + '</span>').join('');
                        }
                    },
                    { data: 'fechaResolucion', className: 'dt-center' },
                    { data: 'tiempoGracia', className: 'dt-center', render: function (d) { return '<b>' + d + ' min</b>'; } },
                    { data: 'notaAdmin' },
                    {
                        data: null, className: 'dt-center', orderable: false, render: function (d, t, r) {
                            return '<button class="btn btn-sm btn-success edit-approved-sched-btn" data-id="' + r.scheduleId + '" data-username="' + r.userName + '" data-grace="' + r.tiempoGracia + '" data-notes="' + (r.notaAdmin || '') + '"><i class="fas fa-edit"></i> Modificar</button>';
                        }
                    }
                ],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordApprovedSchedulesTable();
        }

        function populateCoordApprovedSchedulesTable(forceReload = false) {
            if (!coordApprovedSchedulesTable) return;
            $('#coordApprovedSchedulesTable tbody').html('<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando...</td></tr>');

            if (!forceReload && cachedCoordinatorData && cachedCoordinatorData.approvedSchedules) {
                coordApprovedSchedulesTable.clear().rows.add(cachedCoordinatorData.approvedSchedules).draw();
                return;
            }

            google.script.run.withSuccessHandler(function (d) {
                if (cachedCoordinatorData) cachedCoordinatorData.approvedSchedules = d;
                coordApprovedSchedulesTable.clear().rows.add(d).draw();
            }).getApprovedSchedules(currentUser.areas);
        }

        function handleEditApprovedSchedule(e) {
            e.preventDefault();
            const scheduleId = $('#edit-sched-id').val();
            const grace = $('#edit-sched-grace').val();
            const notes = $('#edit-sched-notes').val().trim();

            if (!grace || isNaN(grace) || parseInt(grace, 10) < 0) {
                showNotification('Atención', 'El tiempo de gracia debe ser un número válido mayor o igual a 0.', 'warning');
                return;
            }

            const $btn = $('#edit-approved-sched-save-btn');
            const orig = $btn.html();
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Guardando...');

            google.script.run.withSuccessHandler(function (res) {
                $btn.prop('disabled', false).html(orig);
                if (res.success) {
                    $('#editApprovedScheduleModal').modal('hide');
                    showNotification('Éxito', res.message, 'success');

                    const subRolNorm = normalizeSubRol(currentUser.subRol);
                    const isAdmin = (currentUser.role === 'Admin' || subRolNorm === 'coordinador general' || subRolNorm === 'superadmin');
                    if (isAdmin) {
                        populateAdminApprovedSchedulesTable(true);
                    } else {
                        populateCoordApprovedSchedulesTable(true);
                    }
                } else {
                    showNotification('Error', res.message, 'danger');
                }
            }).withFailureHandler(function (err) {
                $btn.prop('disabled', false).html(orig);
                showNotification('Error', err.message, 'danger');
            }).updateApprovedScheduleGraceAndNotes(scheduleId, parseInt(grace, 10), notes, currentUser.userId);
        }

        // Inicializar listeners globales
        initPersonalAttendanceModal();
        $(document).on('click', '#personal-attendance-btn', openPersonalAttendanceModal);
        $(document).on('click', '#download-full-history-btn', () => handleDownloadFullUserHistory('#download-full-history-btn'));
        $(document).on('click', '#modal-download-full-history-btn', () => handleDownloadFullUserHistory('#modal-download-full-history-btn'));
        $(document).on('click', '#admin-refresh-approved-schedules-btn', () => populateAdminApprovedSchedulesTable(true));
        $(document).on('click', '#coord-refresh-approved-schedules-btn', () => populateCoordApprovedSchedulesTable(true));

        $(document).on('click', '.edit-approved-sched-btn', function () {
            const id = $(this).data('id');
            const username = $(this).data('username');
            const grace = $(this).data('grace');
            const notes = $(this).data('notes');

            $('#edit-sched-id').val(id);
            $('#edit-sched-username').val(username);
            $('#edit-sched-grace').val(grace);
            $('#edit-sched-notes').val(notes);

            $('#editApprovedScheduleModal').modal('show');
        });

        $(document).on('submit', '#edit-approved-schedule-form', handleEditApprovedSchedule);

        $(document).on('submit', '#resolve-schedule-form', handleResolveScheduleSubmit);
        $(document).on('click', '#resolve-schedule-reject-btn', handleResolveScheduleReject);

        // =======================================================
        // ============= REGISTROS MANUALES (CLIENT SIDE) ========
        // =======================================================
        function initAdminManualRequestsTable() {
            adminManualRequestsTable = $('#adminManualRequestsTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: "fechaSolicitud", className: "dt-center" },
                    { data: "nombreUsuario" },
                    { data: "turno", className: "dt-center" },
                    { data: "institucion" },
                    {
                        data: "tipo", className: "dt-center", render: function (d) {
                            return '<span class="badge badge-pill badge-' + (d === "Entrada" ? "success" : "danger") + '">' + d + '</span>';
                        }
                    },
                    { data: "motivo" },
                    {
                        data: "estado", className: "dt-center", render: function (d) {
                            let b = 'secondary';
                            if (d === 'Pendiente') b = 'warning';
                            if (d === 'Aprobada') b = 'success';
                            if (d === 'Rechazada') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: "dt-center", orderable: false, render: function (data, type, row) {
                            if (row.estado === 'Pendiente') {
                                return '<button class="btn btn-success btn-sm approve-request-btn mr-1" data-id="' + row.solicitudId + '" title="Aprobar"><i class="fas fa-check"></i></button>' +
                                    '<button class="btn btn-danger btn-sm reject-request-btn" data-id="' + row.solicitudId + '" title="Rechazar"><i class="fas fa-times"></i></button>';
                            }
                            return '<span class="text-muted small">Resuelto</span>';
                        }
                    }
                ],
                order: [[0, "desc"]],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateAdminManualRequestsTable();
        }

        function populateAdminManualRequestsTable() {
            if (adminManualRequestsTable) {
                adminManualRequestsTable.clear().draw();
            }
            if (cachedAdminData && cachedAdminData.manualRequests) {
                if (adminManualRequestsTable) {
                    adminManualRequestsTable.clear().rows.add(cachedAdminData.manualRequests).draw();
                }
                return;
            }
            if (adminManualRequestsTable) {
                $('#adminManualRequestsTable tbody').html('<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando solicitudes...</td></tr>');
            }
            google.script.run.withSuccessHandler(function (r) {
                if (adminManualRequestsTable) {
                    $('#adminManualRequestsTable tbody').empty();
                    adminManualRequestsTable.clear().rows.add(r).draw();
                }
            }).getManualCheckRequests('admin');
        }

        function initCoordManualRequestsTable() {
            coordManualRequestsTable = $('#coordManualRequestsTable').DataTable({
                responsive: true,
                data: [],
                columns: [
                    { data: "fechaSolicitud", className: "dt-center" },
                    { data: "nombreUsuario" },
                    { data: "turno", className: "dt-center" },
                    { data: "institucion" },
                    {
                        data: "tipo", className: "dt-center", render: function (d) {
                            return '<span class="badge badge-pill badge-' + (d === "Entrada" ? "success" : "danger") + '">' + d + '</span>';
                        }
                    },
                    { data: "motivo" },
                    {
                        data: "estado", className: "dt-center", render: function (d) {
                            let b = 'secondary';
                            if (d === 'Pendiente') b = 'warning';
                            if (d === 'Aprobada') b = 'success';
                            if (d === 'Rechazada') b = 'danger';
                            return '<span class="badge badge-' + b + '">' + d + '</span>';
                        }
                    },
                    {
                        data: null, className: "dt-center", orderable: false, render: function (data, type, row) {
                            if (row.estado === 'Pendiente') {
                                return '<button class="btn btn-success btn-sm approve-request-btn mr-1" data-id="' + row.solicitudId + '" title="Aprobar"><i class="fas fa-check"></i></button>' +
                                    '<button class="btn btn-danger btn-sm reject-request-btn" data-id="' + row.solicitudId + '" title="Rechazar"><i class="fas fa-times"></i></button>';
                            }
                            return '<span class="text-muted small">Resuelto</span>';
                        }
                    }
                ],
                order: [[0, "desc"]],
                language: { url: "//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json" }
            });
            populateCoordManualRequestsTable();
        }

        function populateCoordManualRequestsTable() {
            if (coordManualRequestsTable) {
                coordManualRequestsTable.clear().draw();
            }
            if (cachedCoordinatorData && cachedCoordinatorData.manualRequests) {
                if (coordManualRequestsTable) {
                    coordManualRequestsTable.clear().rows.add(cachedCoordinatorData.manualRequests).draw();
                }
                return;
            }
            if (coordManualRequestsTable) {
                $('#coordManualRequestsTable tbody').html('<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm"></div> Cargando solicitudes...</td></tr>');
            }
            google.script.run.withSuccessHandler(function (r) {
                if (coordManualRequestsTable) {
                    $('#coordManualRequestsTable tbody').empty();
                    coordManualRequestsTable.clear().rows.add(r).draw();
                }
            }).getManualCheckRequests('coordinator', currentUser.areas);
        }

        function handleResolveManualRequest(button, decision) {
            const id = $(button).data('id');
            const actionText = decision === 'Aprobada' ? 'APROBAR y registrar asistencia' : 'RECHAZAR';

            if (!confirm('¿Seguro de ' + actionText + ' esta solicitud de registro manual?')) return;

            $(button).prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    showNotification('Éxito', res.message, 'success');
                    if (currentUser.role === 'Admin') {
                        cachedAdminData.manualRequests = null;
                        populateAdminManualRequestsTable();
                        cachedAdminData.attendance = null;
                        populateAdminAttendanceTable();
                        // update admin stats
                        google.script.run.withSuccessHandler(function (stats) {
                            if (stats) {
                                $('#stats-total-users').text(stats.totalUsers);
                                $('#stats-today-checks').text(stats.todayChecks);
                                $('#stats-pending-perms').text(stats.pendingPerms);
                                $('#stats-pending-subs').text(stats.pendingSubs);
                            }
                        }).getAdminDashboardStats($('#filter-start-date').val(), $('#filter-end-date').val());
                    } else {
                        cachedCoordinatorData.manualRequests = null;
                        populateCoordManualRequestsTable();
                        cachedCoordinatorData.attendance = null;
                        populateCoordAttendanceTable();
                        // update coordinator stats
                        google.script.run.withSuccessHandler(function (stats) {
                            if (stats) {
                                $('#coord-stats-total-users').text(stats.totalUsers);
                                $('#coord-stats-today-checks').text(stats.todayChecks);
                                $('#coord-stats-pending-perms').text(stats.pendingPerms);
                                $('#coord-stats-pending-subs').text(stats.pendingSubs);
                            }
                        }).getCoordDashboardStats(currentUser.areas);
                    }
                } else {
                    showNotification('Error', res.message, 'danger');
                    $(button).prop('disabled', false).html(decision === 'Aprobada' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>');
                }
            }).withFailureHandler(function (err) {
                showNotification('Error', err.message, 'danger');
                $(button).prop('disabled', false).html(decision === 'Aprobada' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>');
            }).resolveManualCheckRequest(id, decision, currentUser.userId);
        }

        // ---- ENLACE DE EVENTOS PARA MODIFICACIÓN DE CONTRASEÑA ----
        // Delegar en document para que funcione en cualquier dashboard recién cargado
        $(document).on('click', '#change-password-menu-btn', function (e) {
            e.preventDefault();
            $('#change-password-form')[0].reset();
            // Limpiar estilos de validación previos si los hay
            $('#change-password-form input').removeClass('is-invalid is-valid');
            $('#changePasswordModal').modal('show');
        });

        $(document).on('click', '.toggle-password-visibility', function (e) {
            e.preventDefault();
            const targetId = $(this).attr('data-target');
            const $input = $('#' + targetId);
            const $icon = $(this).find('i');
            if ($input.attr('type') === 'password') {
                $input.attr('type', 'text');
                $icon.removeClass('fa-eye').addClass('fa-eye-slash');
            } else {
                $input.attr('type', 'password');
                $icon.removeClass('fa-eye-slash').addClass('fa-eye');
            }
        });

        $(document).on('submit', '#change-password-form', function (e) {
            e.preventDefault();
            const currentPass = $('#current-password').val();
            const newPass = $('#new-password').val();
            const confirmPass = $('#confirm-password').val();

            if (!currentPass || !newPass || !confirmPass) {
                showNotification("Atención", "Todos los campos son obligatorios.", "warning");
                return;
            }

            if (newPass.length < 4) {
                showNotification("Atención", "La nueva contraseña debe tener un mínimo de 4 caracteres.", "warning");
                return;
            }

            if (newPass !== confirmPass) {
                showNotification("Atención", "La nueva contraseña y la confirmación no coinciden.", "warning");
                return;
            }

            if (!currentUser || !currentUser.userId) {
                showNotification("Error", "No se detectó una sesión activa. Intente iniciar sesión nuevamente.", "danger");
                return;
            }

            const $btn = $('#submit-change-password-btn');
            const originalHtml = $btn.html();
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Guardando...');

            google.script.run
                .withSuccessHandler(function (res) {
                    $btn.prop('disabled', false).html(originalHtml);
                    if (res && res.success) {
                        showNotification("Éxito", res.message || "Contraseña actualizada con éxito.", "success");
                        $('#changePasswordModal').modal('hide');
                    } else {
                        showNotification("Error", (res ? res.message : "Error desconocido al cambiar contraseña."), "danger");
                    }
                })
                .withFailureHandler(function (err) {
                    $btn.prop('disabled', false).html(originalHtml);
                    showNotification("Error", "Error de servidor: " + (err ? err.message : "Desconocido"), "danger");
                })
                .changeUserPassword(currentUser.userId, currentPass, newPass);
        });

    // --- MOTOR DE GENERACIÓN DE REPORTES (Fase 3) ---
    let currentReportScope = null;

    function openReportGenerator(scope) {
        currentReportScope = scope;
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        $('#rep-start-date').val(firstDay.toISOString().split('T')[0]);
        $('#rep-end-date').val(lastDay.toISOString().split('T')[0]);

        $('#reportGeneratorModal').modal('show');
    }

    $(document).on('click', '.rep-period-preset', function () {
        const preset = $(this).data('preset');
        const today = new Date();
        let start, end;

        if (preset === 'this-month') {
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (preset === 'last-month') {
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
        } else if (preset === 'this-quarter') {
            const quarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), quarter * 3, 1);
            end = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        } else if (preset === 'this-year') {
            start = new Date(today.getFullYear(), 0, 1);
            end = new Date(today.getFullYear(), 11, 31);
        }

        if (start && end) {
            $('#rep-start-date').val(start.toISOString().split('T')[0]);
            $('#rep-end-date').val(end.toISOString().split('T')[0]);
        }
    });

    $(document).on('click', '#rep-select-all-btn', function () {
        $('.rep-section-chk').not(':disabled').prop('checked', true);
    });

    $(document).on('click', '#rep-deselect-all-btn', function () {
        $('.rep-section-chk').not(':disabled').prop('checked', false);
    });

    $(document).on('submit', '#report-generator-form', handleGenerateReport);

    function handleGenerateReport(e) {
        e.preventDefault();

        const start = $('#rep-start-date').val();
        const end = $('#rep-end-date').val();
        const format = $('#rep-format').val();
        const generateBtn = $('#rep-generate-btn');
        const spinner = $('#rep-spinner');
        const originalText = generateBtn.html();

        if (!start || !end) {
            showNotification('Atención', 'Selecciona fechas de inicio y fin.', 'warning');
            return;
        }

        const sections = [];
        $('.rep-section-chk:checked').each(function () {
            sections.push($(this).val());
        });

        generateBtn.prop('disabled', true);
        spinner.removeClass('d-none');

        google.script.run.withSuccessHandler(function (reportData) {
            generateBtn.prop('disabled', false);
            spinner.addClass('d-none');

            if (!reportData || reportData.error) {
                showNotification('Error', 'Fallo al generar datos del reporte: ' + (reportData ? reportData.error : 'Desconocido'), 'danger');
                return;
            }

            try {
                if (format === 'xlsx' || format === 'both') {
                    generateXLSXReport(reportData);
                }
                if (format === 'docx' || format === 'both') {
                    generateDOCXReport(reportData, sections);
                }
                showNotification('Éxito', 'Reporte generado y descargado correctamente.', 'success');
                $('#reportGeneratorModal').modal('hide');
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error al procesar la exportación del archivo: ' + err.message, 'danger');
            }

        }).withFailureHandler(function (err) {
            generateBtn.prop('disabled', false);
            spinner.addClass('d-none');
            showNotification('Error', 'Error de red o servidor: ' + err.message, 'danger');
        }).generateComprehensiveReport(start, end, currentReportScope);
    }

    function generateXLSXReport(reportData) {
        const wb = XLSX.utils.book_new();
        const meta = reportData.metadata;
        const resumenRows = [
            ["INFORME CONSOLIDADO DE PERSONAL"],
            ["Generado el:", meta.generadoEl],
            ["Período:", `${meta.periodo.inicio} al ${meta.periodo.fin}`],
            ["Total Operadores:", meta.totalOperadores],
            ["Días Laborables del Período:", meta.diasLaborablesGlobales],
            [],
            ["RESUMEN DE CONTADORES POR SECCIÓN"],
            ["Sección", "Métrica principal", "Valor"],
            ["Amonestaciones", "Total amonestaciones registradas", reportData.amonestaciones.resumen.total],
            ["Inasistencias", "Días totales ausentes acumulados", reportData.inasistencias.resumen.totalDiasAusentes],
            ["Inasistencias", "Operadores con inasistencias", reportData.inasistencias.resumen.operadoresConAusencias],
            ["Llegadas Tarde", "Total de incidencias de retraso", reportData.llegadasTarde.resumen.totalIncidencias],
            ["Permisos", "Total permisos aprobados", reportData.permisos.resumen.total],
            ["Cross de Turno", "Total cruces de turno aprobados", reportData.crossTurno.resumen.total],
            ["Guardias", "Total guardias programadas en rango", reportData.guardias.resumen.total]
        ];
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
        XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen General");

        function appendSheetFromArray(array, sheetName, headersMap) {
            if (!array || array.length === 0) {
                const ws = XLSX.utils.aoa_to_sheet([["Sin registros en este período"]]);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
                return;
            }
            const keys = Object.keys(headersMap);
            const headers = Object.values(headersMap);
            const rows = [headers];
            array.forEach(item => {
                const row = keys.map(key => {
                    let val = item[key];
                    if (val === undefined || val === null) return "";
                    if (typeof val === 'object') return JSON.stringify(val);
                    return val;
                });
                rows.push(row);
            });
            const ws = XLSX.utils.aoa_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        appendSheetFromArray(reportData.amonestaciones.detalle, "Amonestaciones", {
            nombre: "Operador",
            tipo: "Tipo de Amonestación",
            fecha: "Fecha",
            descripcion: "Descripción",
            estado: "Estado",
            origen: "Origen"
        });

        appendSheetFromArray(reportData.inasistencias.detalle, "Asistencia e Inasistencias", {
            nombre: "Operador",
            institucion: "Institución",
            turno: "Turno",
            fechaInclusion: "Fecha de Ingreso",
            diasLaborables: "Días Laborables",
            diasPresente: "Días Presente",
            diasAusente: "Días Ausente",
            porcentajeAsistencia: "% Asistencia",
            fechasAusencia: "Fechas de Ausencia"
        });

        appendSheetFromArray(reportData.llegadasTarde.detalle, "Llegadas Tarde", {
            nombre: "Operador",
            fecha: "Fecha",
            horaEntrada: "Hora de Marcado",
            horaProgramada: "Hora Programada",
            retrasoMinutos: "Retraso (Minutos)",
            status: "Tipo de Registro"
        });

        appendSheetFromArray(reportData.permisos.detalleMensual, "Permisos Aprobados", {
            nombre: "Operador",
            mes: "Mes",
            total: "Cantidad de Permisos",
            tiposStr: "Tipos de Permiso"
        });

        appendSheetFromArray(reportData.crossTurno.porUsuario, "Cross de Turno", {
            nombre: "Operador",
            haCubierto: "Ha Cubierto a Otros (veces)",
            loCubrieron: "Lo han Cubierto (veces)"
        });

        appendSheetFromArray(reportData.horasTrabajadas.detalle, "Horas Trabajadas", {
            nombre: "Operador",
            institucion: "Institución",
            turno: "Turno",
            diasTrabajados: "Días Trabajados",
            diasAusentes: "Ausencias en Días",
            horasTrabajadas: "Horas Acumuladas Trabajadas",
            horasAdeudantes: "Horas Acumuladas Adeudantes",
            minutosTrabajados: "Minutos Trabajados",
            minutosAdeudantes: "Minutos Adeudantes",
            horasCompensadas: "Horas de Compensación (Pagando Horas)",
            minutosCompensadas: "Minutos de Compensación (Pagando Horas)"
        });

        const anomaliasRows = [
            ["ANOMALÍAS DETECTADAS EN EL PERÍODO"],
            [],
            ["1. SESIONES SIN REGISTRO DE SALIDA (CIERRE AUTOMÁTICO)"],
            ["Operador", "Fecha de Entrada", "Hora de Entrada"]
        ];
        reportData.anomalias.sinSalida.forEach(item => {
            anomaliasRows.push([item.nombre, item.fecha, item.hora]);
        });
        anomaliasRows.push([]);
        anomaliasRows.push(["2. REGISTROS DE ASISTENCIA MANUALES"]);
        anomaliasRows.push(["Operador", "Tipo", "Fecha", "Hora"]);
        reportData.anomalias.registroManual.forEach(item => {
            anomaliasRows.push([item.nombre, item.tipo, item.fecha, item.hora]);
        });
        anomaliasRows.push([]);
        anomaliasRows.push(["3. REGISTROS FUERA DEL RANGO GEOGRÁFICO"]);
        anomaliasRows.push(["Operador", "Tipo", "Fecha", "Hora", "Distancia (metros)"]);
        reportData.anomalias.fueraDeRango.forEach(item => {
            anomaliasRows.push([item.nombre, item.tipo, item.fecha, item.hora, Math.round(item.distancia)]);
        });
        const wsAnomalias = XLSX.utils.aoa_to_sheet(anomaliasRows);
        XLSX.utils.book_append_sheet(wb, wsAnomalias, "Anomalías");

        appendSheetFromArray(reportData.guardias.detalle, "Guardias Especiales", {
            fecha: "Fecha Guardia",
            turno: "Turno",
            categoria: "Categoría",
            descripcion: "Descripción",
            asistentes: "Cantidad Asistentes",
            nombresAsistentes: "Nombres de los Asistentes"
        });

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
        function s2ab(s) {
            const buf = new ArrayBuffer(s.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < s.length; i++) view[i] = s.charCodeAt(i) & 0xFF;
            return buf;
        }
        const blob = new Blob([s2ab(wbout)], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reporte_Consolidado_${meta.periodo.inicio}_a_${meta.periodo.fin}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function generateDOCXReport(reportData, sections) {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } = docx;
        const docSections = [];
        const meta = reportData.metadata;

        const titleParagraphs = [
            new Paragraph({
                text: "INFORME CONSOLIDADO DE ASISTENCIA Y RENDIMIENTO",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { before: 200, after: 100 }
            }),
            new Paragraph({
                text: `Período del reporte: ${meta.periodo.inicio} al ${meta.periodo.fin}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 300 }
            }),
            new Paragraph({
                text: `Generado el: ${meta.generadoEl}`,
                alignment: AlignmentType.CENTER,
                spacing: { after: 600 }
            }),
            new Paragraph({
                text: "1. RESUMEN GENERAL DE INDICADORES",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            })
        ];

        const statsRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Indicador / Métrica", bold: true })] })], width: { size: 3000, type: WidthType.DXA } }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Valor", bold: true })] })], width: { size: 1500, type: WidthType.DXA } })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Total Operadores Evaluados")] }),
                    new TableCell({ children: [new Paragraph(String(meta.totalOperadores))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Días Laborables del Período")] }),
                    new TableCell({ children: [new Paragraph(String(meta.diasLaborablesGlobales))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Amonestaciones Totales")] }),
                    new TableCell({ children: [new Paragraph(String(reportData.amonestaciones.resumen.total))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Total de Días Ausentes Acumulados")] }),
                    new TableCell({ children: [new Paragraph(String(reportData.inasistencias.resumen.totalDiasAusentes))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Llegadas Tarde / Retrasos")] }),
                    new TableCell({ children: [new Paragraph(String(reportData.llegadasTarde.resumen.totalIncidencias))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Permisos Aprobados")] }),
                    new TableCell({ children: [new Paragraph(String(reportData.permisos.resumen.total))] })
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("Suplencias y Cross de Turno")] }),
                    new TableCell({ children: [new Paragraph(String(reportData.crossTurno.resumen.total))] })
                ]
            })
        ];

        const statsTable = new Table({
            rows: statsRows,
            width: { size: 4500, type: WidthType.DXA }
        });

        titleParagraphs.push(new Paragraph({ text: "", spacing: { after: 100 } }));
        titleParagraphs.push(statsTable);
        titleParagraphs.push(new Paragraph({ text: "", spacing: { after: 300 } }));

        const docChildren = [...titleParagraphs];

        function createTableFromData(dataArray, headersMap, colWidths) {
            const keys = Object.keys(headersMap);
            const headers = Object.values(headersMap);

            const rows = [
                new TableRow({
                    children: headers.map((h, i) => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                        width: { size: colWidths[i] || 1500, type: WidthType.DXA }
                    }))
                })
            ];

            if (!dataArray || dataArray.length === 0) {
                rows.push(new TableRow({
                    children: [new TableCell({
                        children: [new Paragraph("Sin registros en este período")],
                        columnSpan: keys.length
                    })]
                }));
            } else {
                dataArray.forEach(item => {
                    rows.push(new TableRow({
                        children: keys.map((key, i) => {
                            let text = item[key];
                            if (text === undefined || text === null) text = "";
                            return new TableCell({
                                children: [new Paragraph(String(text))],
                                width: { size: colWidths[i] || 1500, type: WidthType.DXA }
                            });
                        })
                    }));
                });
            }

            return new Table({ rows: rows });
        }

        if (sections.indexOf('amonestaciones') !== -1) {
            docChildren.push(new Paragraph({
                text: "2. AMONESTACIONES REGISTRADAS",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.amonestaciones.detalle, {
                nombre: "Operador",
                tipo: "Tipo",
                fecha: "Fecha",
                descripcion: "Descripción",
                estado: "Estado"
            }, [1800, 1800, 1200, 3000, 1200]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('inasistencias') !== -1) {
            docChildren.push(new Paragraph({
                text: "3. ASISTENCIA E INASISTENCIAS",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.inasistencias.detalle, {
                nombre: "Operador",
                fechaInclusion: "Fecha Ingreso",
                diasLaborables: "Laborables",
                diasPresente: "Presente",
                diasAusente: "Ausente",
                porcentajeAsistencia: "% Asist."
            }, [2500, 1500, 1200, 1200, 1200, 1200]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('retrasos') !== -1) {
            docChildren.push(new Paragraph({
                text: "4. CONTROL DE LLEGADAS TARDE",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.llegadasTarde.detalle, {
                nombre: "Operador",
                fecha: "Fecha",
                horaEntrada: "Entrada",
                horaProgramada: "Programado",
                retrasoMinutos: "Retraso (min)"
            }, [2500, 1500, 1500, 1500, 1800]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('permisos') !== -1) {
            docChildren.push(new Paragraph({
                text: "5. SOLICITUDES DE PERMISO APROBADAS",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.permisos.detalleMensual, {
                nombre: "Operador",
                mes: "Período / Mes",
                total: "Cantidad",
                tiposStr: "Clasificación de Permiso"
            }, [2500, 1500, 1200, 3500]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('crossturnos') !== -1) {
            docChildren.push(new Paragraph({
                text: "6. SUPLENCIAS Y CROSS DE TURNO",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.crossTurno.porUsuario, {
                nombre: "Operador",
                haCubierto: "Ha Cubierto a Otros (veces)",
                loCubrieron: "Lo han Cubierto (veces)"
            }, [3500, 2500, 2500]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('horas') !== -1) {
            docChildren.push(new Paragraph({
                text: "7. REPORTE DE HORAS TRABAJADAS",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.horasTrabajadas.detalle, {
                nombre: "Operador",
                institucion: "Institución",
                turno: "Turno",
                diasTrabajados: "Días Trab.",
                diasAusentes: "Días Aus.",
                horasTrabajadas: "Horas Trab. Acum.",
                horasAdeudantes: "Horas Adeud. Acum.",
                minutosTrabajados: "Min. Trab.",
                minutosAdeudantes: "Min. Adeud.",
                horasCompensadas: "Horas Comp.",
                minutosCompensadas: "Min. Comp."
            }, [1500, 1000, 800, 800, 800, 1000, 1000, 800, 800, 800, 800]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('anomalias') !== -1) {
            docChildren.push(new Paragraph({
                text: "8. REGISTROS ANÓMALOS DE ASISTENCIA",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));

            docChildren.push(new Paragraph({ text: "8.1. Sesiones sin marcar salida (Cierre Automático)", spacing: { before: 100, after: 100 }, bold: true }));
            const t1 = createTableFromData(reportData.anomalias.sinSalida, {
                nombre: "Operador",
                fecha: "Fecha",
                hora: "Hora Entrada"
            }, [3500, 2500, 2500]);
            docChildren.push(t1);

            docChildren.push(new Paragraph({ text: "8.2. Registros Manuales por Coordinación", spacing: { before: 150, after: 100 }, bold: true }));
            const t2 = createTableFromData(reportData.anomalias.registroManual, {
                nombre: "Operador",
                tipo: "Marcado",
                fecha: "Fecha",
                hora: "Hora"
            }, [3000, 1500, 2000, 2000]);
            docChildren.push(t2);

            docChildren.push(new Paragraph({ text: "8.3. Marcados fuera del rango geográfico permitido", spacing: { before: 150, after: 100 }, bold: true }));
            const t3 = createTableFromData(reportData.anomalias.fueraDeRango, {
                nombre: "Operador",
                tipo: "Marcado",
                fecha: "Fecha",
                hora: "Hora",
                distancia: "Distancia (m)"
            }, [2500, 1200, 1800, 1500, 1500]);
            docChildren.push(t3);

            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        if (sections.indexOf('guardias') !== -1) {
            docChildren.push(new Paragraph({
                text: "9. PLANIFICACIÓN DE GUARDIAS ESPECIALES",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 }
            }));
            const table = createTableFromData(reportData.guardias.detalle, {
                fecha: "Fecha",
                turno: "Turno",
                categoria: "Categoría",
                asistentes: "Asistentes",
                nombresAsistentes: "Nombres"
            }, [1200, 1200, 1800, 1200, 3500]);
            docChildren.push(table);
            docChildren.push(new Paragraph({ text: "", spacing: { after: 200 } }));
        }

        docSections.push({
            properties: {},
            children: docChildren
        });

        const doc = new Document({
            sections: docSections
        });

        Packer.toBlob(doc).then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Reporte_Consolidado_${meta.periodo.inicio}_a_${meta.periodo.fin}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    }

    // --- LÓGICA DE TEMA (Dark por defecto, toggle a Light) ---
    function toggleTheme() {
        const body = document.body;
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        const icon = btn.querySelector('i');

        body.classList.toggle('light-mode');
        // Also remove legacy dark-mode class if present
        body.classList.remove('dark-mode');

        const isLight = body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');

        if (isLight) {
            if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
        } else {
            if (icon) { icon.classList.remove('fa-moon'); icon.classList.add('fa-sun'); }
        }
    }

    (function () {
        const savedTheme = localStorage.getItem('theme');
        // Default is dark. Only add light-mode if explicitly saved.
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
        }
        // Remove legacy dark-mode class
        document.body.classList.remove('dark-mode');
        setTimeout(function () {
            const btn = document.getElementById('theme-toggle-btn');
            if (!btn) return;
            const isLight = document.body.classList.contains('light-mode');
            if (isLight) {
                btn.innerHTML = '<i class="fas fa-moon"></i>';
            } else {
                btn.innerHTML = '<i class="fas fa-sun"></i>';
            }
        }, 100);
    })();

    // =======================================================
    // ===== FASE 3: ESTANDARIZACIÓN DE BASE DE DATOS ========
    // =======================================================

    function verificarEstructura() {
        const $btn = $('#btn-verificar-estructura');
        const orig = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Verificando...');

        google.script.run.withSuccessHandler(function (resultados) {
            $btn.prop('disabled', false).html(orig);
            let html = '<table class="table table-sm table-bordered small"><thead class="thead-dark">' +
                '<tr><th>Hoja</th><th>Estado</th><th>Cols</th><th>Filas</th><th>Detalle</th></tr></thead><tbody>';

            resultados.forEach(function (r) {
                const badgeClass = r.estado === 'OK' ? 'success' : (r.estado === 'FALTANTE' ? 'danger' : 'warning');
                const icon = r.estado === 'OK' ? 'check-circle' : (r.estado === 'FALTANTE' ? 'times-circle' : 'exclamation-triangle');
                let detalle = '';
                if (r.columnasFaltantes && r.columnasFaltantes.length) {
                    detalle += '<span class="text-danger">Faltan: ' + r.columnasFaltantes.join(', ') + '</span><br>';
                }
                if (r.columnasExtra && r.columnasExtra.length) {
                    detalle += '<span class="text-info">Extra: ' + r.columnasExtra.join(', ') + '</span><br>';
                }
                if (r.detalle) detalle += r.detalle;
                if (!detalle) detalle = '<span class="text-success">Sin discrepancias</span>';

                html += '<tr><td><strong>' + r.hoja + '</strong></td>' +
                    '<td><span class="badge badge-' + badgeClass + '"><i class="fas fa-' + icon + ' mr-1"></i>' + r.estado + '</span></td>' +
                    '<td>' + (r.columnasActuales || 0) + '/' + r.columnasEsperadas + '</td>' +
                    '<td>' + (r.filas !== undefined ? r.filas : 'N/A') + '</td>' +
                    '<td>' + detalle + '</td></tr>';
            });

            html += '</tbody></table>';
            $('#estructura-resultado').html(html).show();
        }).withFailureHandler(function (e) {
            $btn.prop('disabled', false).html(orig);
            showNotification('Error', 'No se pudo verificar: ' + (e.message || e), 'error');
        }).verificarEstructuraSheets();
    }

    function repararEstructura() {
        if (!confirm('¿Desea crear las hojas faltantes? Esto NO modificará datos existentes.')) return;

        const $btn = $('#btn-reparar-estructura');
        const orig = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Reparando...');

        google.script.run.withSuccessHandler(function (r) {
            $btn.prop('disabled', false).html(orig);
            showNotification('Reparación Completada', r.mensaje, 'success');
            verificarEstructura();
        }).withFailureHandler(function (e) {
            $btn.prop('disabled', false).html(orig);
            showNotification('Error', 'No se pudo reparar: ' + (e.message || e), 'error');
        }).repararEstructuraSheets();
    }

    function exportarEstructura() {
        const $btn = $('#btn-exportar-estructura');
        const orig = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Exportando...');

        google.script.run.withSuccessHandler(function (resultados) {
            $btn.prop('disabled', false).html(orig);

            const wb = XLSX.utils.book_new();
            const wsData = [["Hoja", "Estado", "Cols Esperadas", "Cols Actuales", "Filas de Datos", "Cols Faltantes", "Cols Extra"]];

            resultados.forEach(function (r) {
                wsData.push([
                    r.hoja, r.estado, r.columnasEsperadas, r.columnasActuales || 0,
                    r.filas !== undefined ? r.filas : 'N/A',
                    (r.columnasFaltantes || []).join(', '),
                    (r.columnasExtra || []).join(', ')
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = Array(7).fill({ wch: 25 });
            XLSX.utils.book_append_sheet(wb, ws, "Verificacion_ASIS");
            XLSX.writeFile(wb, "Estructura_ASIS_" + new Date().toISOString().slice(0, 10) + ".xlsx");
        }).withFailureHandler(function (e) {
            $btn.prop('disabled', false).html(orig);
            showNotification('Error', 'No se pudo exportar: ' + (e.message || e), 'error');
        }).verificarEstructuraSheets();
    }

    function ejecutarDiagnostico() {
        const $btn = $('#btn-diagnostico-sistema');
        const orig = $btn.html();
        $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin mr-1"></i> Diagnosticando...');

        google.script.run.withSuccessHandler(function (r) {
            $btn.prop('disabled', false).html(orig);
            const hojas = Object.keys(r.hojas || {}).length;
            const triggers = (r.triggers || []).length;
            const errores = (r.errores || []).length;
            const cacheOk = r.cache && r.cache.funcionando;
            let msg = `✅ Hojas encontradas: ${hojas} | Triggers activos: ${triggers} | Caché: ${cacheOk ? 'OK' : 'ERROR'}`;
            if (errores > 0) msg += ` | ⚠️ ${errores} error(es): ` + r.errores.join(', ');
            showNotification('Diagnóstico del Sistema', msg, errores > 0 ? 'warning' : 'success');
        }).withFailureHandler(function (e) {
            $btn.prop('disabled', false).html(orig);
            showNotification('Error', 'No se pudo diagnosticar: ' + (e.message || e), 'error');
        }).diagnosticoDelSistema();
    }

    // =======================================================
    // ===== FASE 5: EXPIRACIÓN DE SESIÓN POR INACTIVIDAD ====
    // =======================================================
    (function () {
        let inactivityTimer;
        const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

        function resetInactivityTimer() {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(function () {
                if (sessionStorage.getItem('currentUser')) {
                    sessionStorage.clear();
                    if (typeof showNotification === 'function') {
                        showNotification('Sesión Expirada', 'Su sesión ha expirado por inactividad. Por favor, inicie sesión de nuevo.', 'warning');
                    }
                    setTimeout(function () {
                        if (typeof loadLogin === 'function') loadLogin();
                    }, 3000);
                }
            }, SESSION_TIMEOUT);
        }

        document.addEventListener('click', resetInactivityTimer, true);
        document.addEventListener('keypress', resetInactivityTimer, true);
        document.addEventListener('scroll', resetInactivityTimer, true);
        document.addEventListener('touchstart', resetInactivityTimer, true);
        resetInactivityTimer();
    })();


        $(document).on('click', '.reset-device-btn', function () {
            const uid = $(this).data('user-id');
            const uname = $(this).data('user-name');
            if (!confirm(`¿Desea desvincular el equipo de "${uname}"? El usuario podrá vincular un nuevo dispositivo en su próximo marcaje.`)) {
                return;
            }
            const btn = $(this);
            btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

            google.script.run.withSuccessHandler(function (res) {
                btn.prop('disabled', false).html('<i class="fas fa-unlink"></i>');
                if (res && res.success) {
                    showNotification('Dispositivo Desvinculado', res.message || 'Equipo reseteado con éxito.', 'success');
                    if (typeof populateUsersManagementTable === 'function' || typeof window.populateUsersManagementTable === 'function') {
                        if (typeof cachedAdminData !== 'undefined' && cachedAdminData) cachedAdminData.users = null;
                        if (window.cachedAdminData) window.cachedAdminData.users = null;
                        const p = (typeof populateUsersManagementTable === 'function') ? populateUsersManagementTable : window.populateUsersManagementTable;
                        p();
                    }
                    if (typeof populateCoordUsersTable === 'function' || typeof window.populateCoordUsersTable === 'function') {
                        if (typeof cachedCoordinatorData !== 'undefined' && cachedCoordinatorData) cachedCoordinatorData.users = null;
                        if (window.cachedCoordinatorData) window.cachedCoordinatorData.users = null;
                        const p = (typeof populateCoordUsersTable === 'function') ? populateCoordUsersTable : window.populateCoordUsersTable;
                        p();
                    }
                } else {
                    showNotification('Error', (res ? res.message : 'Error al resetear equipo'), 'danger');
                }
            }).withFailureHandler(function (err) {
                btn.prop('disabled', false).html('<i class="fas fa-unlink"></i>');
                showNotification('Error', 'Error de red: ' + err.message, 'danger');
            }).resetUserDevice(uid);
        });

        $(document).on('click', '#btn-export-sabana-admin', function () {
            const fn = (typeof handleWeeklySabanaExport === 'function') ? handleWeeklySabanaExport : window.handleWeeklySabanaExport;
            if (typeof fn === 'function') {
                fn('admin');
            } else {
                console.error('handleWeeklySabanaExport no disponible');
            }
        });
        $(document).on('click', '#btn-export-sabana-coord', function () {
            const fn = (typeof handleWeeklySabanaExport === 'function') ? handleWeeklySabanaExport : window.handleWeeklySabanaExport;
            const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : (window.currentUser || JSON.parse(sessionStorage.getItem('currentUser') || '{}'));
            const areas = u.areas || [];
            if (typeof fn === 'function') {
                fn(areas);
            } else {
                console.error('handleWeeklySabanaExport no disponible');
            }
        });
});
