const nodemailer = require('nodemailer');
const notifier = require('node-notifier');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

// Importar el gestor de datos de clientes
const customerData = require('./customerData');
// Configuración de correo electrónico
const emailConfig = {
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
        user: "your-outlook@outlook.com",
        pass: "your-password"
    }
};
const transporter = nodemailer.createTransport(emailConfig);

// Estado de los usuarios
const userStates = new Map();

// Información del restaurante
const restaurantInfo = `🏪 *RESTAURANTE PUNTA CAMARON*
📍 Ubicación: Calle 20D# 96G-82, Bogotá
⏰ Horario: 
   Lunes a Domingos: 11:00 - 17:30
📞 Teléfono: 323 2209593
`;

const mainMenu = `*BIENVENIDO A PUNTA CAMARÓN*
Seleccione una opción:

1️⃣ Obtener más información
2️⃣ Comprar un producto
3️⃣ Hacer una reserva

Para volver al menú principal en cualquier momento, escriba "menu"

Al usar este chatbot, usted acepta nuestros términos y condiciones para el manejo de datos personales.`;

//Funcion para manejar el contacto con el asesor
async function handleAdvisorContact(message) {
    const userPhone = message.from;
    const timestamp = new Date().toLocaleString();
    
    try {
        // Send confirmation to user
        await client.sendMessage(message.from, `✅ *Solicitud de asesor registrada*
    
Un asesor tomará control de la conversación en breve.
Por favor, espere unos momentos.`);

        // Send WhatsApp notification to owner
        const ownerNumber = '573232209593@c.us';
        await client.sendMessage(ownerNumber, `🔔 *Nueva solicitud de asesor*
    
📱 Cliente: ${userPhone}
⏰ Hora: ${timestamp}

Para atender al cliente, responda directamente a este chat.`);

        // Send email notification via Outlook
        const mailOptions = {
            from: emailConfig.auth.user,
            to: 'owner-outlook@outlook.com',
            subject: '🔔 Nueva solicitud de asesor - Punta Camarón',
            html: `
                <h2>Nueva solicitud de asesor</h2>
                <p><strong>Cliente:</strong> ${userPhone}</p>
                <p><strong>Hora:</strong> ${timestamp}</p>
                <p><strong>Acción requerida:</strong> Por favor, contacte al cliente lo antes posible.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        // Show Windows notification
        notifier.notify({
            title: 'Punta Camarón - Nueva Solicitud',
            message: `Cliente: ${userPhone}\nHora: ${timestamp}`,
            icon: path.join(__dirname, 'assets', 'logo.png'),
            sound: true,
            wait: true,
            appID: 'Punta Camarón Bot'
        });

        // Update user state
        userStates.set(message.from, 'waiting_for_advisor');
        
        // Log the request
        console.log('Nueva solicitud de asesor:', {
            userPhone,
            timestamp,
            notificationsSent: {
                whatsapp: true,
                email: true,
                system: true
            }
        });

    } catch (error) {
        console.error('Error en handleAdvisorContact:', error);
        await client.sendMessage(message.from, 'Lo sentimos, hubo un error al procesar su solicitud. Por favor intente nuevamente.');
    }
}

async function notifyOwnerOfPurchase(purchaseData) {
    try {
        // WhatsApp notification
        const ownerNumber = '573232209593@c.us';
        let notificationMessage = `🛍️ *NUEVO PEDIDO RECIBIDO*\n
🔢 Pedido #${purchaseData.orderNumber}
📋 Tipo: ${purchaseData.type === 'restaurant' ? 'RESTAURANTE' : 'PRODUCTOS CONGELADOS'}
👤 Cliente: ${purchaseData.name}
📱 Teléfono: ${purchaseData.phone}
🏠 Dirección: ${purchaseData.address}

🛒 *PRODUCTOS ORDENADOS:*
${purchaseData.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}

💳 Método de pago: ${purchaseData.paymentMethod}

⚠️ *ACCIÓN REQUERIDA:*
Por favor, envíe la cotización al cliente.`;

        await client.sendMessage(ownerNumber, notificationMessage);

        // Email notification
        const mailOptions = {
            from: emailConfig.auth.user,
            to: process.env.OWNER_EMAIL,
            subject: `🛍️ Nuevo Pedido #${purchaseData.orderNumber} - Punta Camarón`,
            html: `
                <h2>Nuevo Pedido Recibido</h2>
                <p><strong>Pedido #:</strong> ${purchaseData.orderNumber}</p>
                <p><strong>Tipo:</strong> ${purchaseData.type === 'restaurant' ? 'RESTAURANTE' : 'PRODUCTOS CONGELADOS'}</p>
                <p><strong>Cliente:</strong> ${purchaseData.name}</p>
                <p><strong>Teléfono:</strong> ${purchaseData.phone}</p>
                <p><strong>Dirección:</strong> ${purchaseData.address}</p>
                <h3>Productos ordenados:</h3>
                <ul>
                    ${purchaseData.items.map(item => `<li>${item}</li>`).join('')}
                </ul>
                <p><strong>Método de pago:</strong> ${purchaseData.paymentMethod}</p>
                <p><strong>ACCIÓN REQUERIDA:</strong> Enviar cotización al cliente.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        // System notification
        notifier.notify({
            title: `Nuevo Pedido #${purchaseData.orderNumber}`,
            message: `Cliente: ${purchaseData.name}\nProductos: ${purchaseData.items.length}\nEnviar cotización!`,
            icon: path.join(__dirname, 'assets', 'logo.png'),
            sound: true,
            wait: true,
            appID: 'Punta Camarón Bot'
        });

    } catch (error) {
        console.error('Error notificando al propietario:', error);
    }
}
// Nuevo menú para compra
const purchaseMenu = `*OPCIONES DE COMPRA*
Seleccione una opción:

1️⃣ Pedir al restaurante
2️⃣ Comprar productos congelados

Para volver al menú principal, escriba "menu"`;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    }
});

// Función para manejar el menú principal
async function handleMainMenu(message) {
    await client.sendMessage(message.from, mainMenu);
    userStates.set(message.from, 'main_menu');
}

// Función para manejar el submenú de compra
async function handlePurchaseMenu(message) {
    await client.sendMessage(message.from, purchaseMenu);
    userStates.set(message.from, 'purchase_menu');
}

// Función para manejar la compra de productos
async function handlePurchase(message, purchaseType) {
    const currentState = userStates.get(message.from);
    const currentStep = currentState.split('_')[1];
    const userData = customerData.initCustomerData(message.from, 'purchase');
    
    // Si es una nueva compra, establecer el tipo de compra
    if (currentStep === 'start') {
        customerData.saveField(message.from, 'purchase', 'type', purchaseType);
    }
    
    switch(currentStep) {
        case 'start':
            await client.sendMessage(message.from, '📝 Por favor, ingrese su nombre completo:');
            userStates.set(message.from, 'purchase_name');
            break;
            
        case 'name':
            customerData.saveField(message.from, 'purchase', 'name', message.body);
            userStates.set(message.from, 'purchase_phone');
            await client.sendMessage(message.from, '📱 Ingrese su número de teléfono:');
            break;
            
        case 'phone':
            customerData.saveField(message.from, 'purchase', 'phone', message.body);
            userStates.set(message.from, 'purchase_address');
            await client.sendMessage(message.from, '🏠 Ingrese su dirección de entrega:');
            break;
            
        case 'address':
            customerData.saveField(message.from, 'purchase', 'address', message.body);
            userStates.set(message.from, 'purchase_items');
            
            // Mensaje personalizado según el tipo de compra
            const purchaseData = customerData.getCustomerData(message.from).purchase.data;
            if (purchaseData.type === 'restaurant') {
                await client.sendMessage(message.from, '🍽️ Por favor, ingrese los productos que desea ordenar del restaurante (separe cada item con una coma):');
            } else {
                await client.sendMessage(message.from, '❄️ Por favor, ingrese los productos congelados que desea comprar (separe cada item con una coma):');
            }
            break;
            
        case 'items':
            const items = message.body.split(',').map(item => item.trim());
            customerData.saveField(message.from, 'purchase', 'items', items);
            userStates.set(message.from, 'purchase_payment');
            
            // Obtener datos actualizados
            const updatedPurchaseData = customerData.getCustomerData(message.from).purchase.data;
            
            // Crear resumen del pedido
            let orderSummary = `*RESUMEN DE SU PEDIDO*`;
            
            // Añadir el tipo de pedido al resumen
            if (updatedPurchaseData.type === 'restaurant') {
                orderSummary += ` - RESTAURANTE`;
            } else {
                orderSummary += ` - PRODUCTOS CONGELADOS`;
            }
            
            orderSummary += `
👤 Nombre: ${updatedPurchaseData.name}
📱 Teléfono: ${updatedPurchaseData.phone}
🏠 Dirección: ${updatedPurchaseData.address}
            
🛒 *PRODUCTOS ORDENADOS:*
${updatedPurchaseData.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}

Seleccione su método de pago:
1️⃣ Efectivo
2️⃣ Datáfono (Tarjeta)
3️⃣ Transferencia bancaria`;
            
            await client.sendMessage(message.from, orderSummary);
            break;
        
        case 'payment':
            // Guardar método de pago seleccionado
            let paymentMethod;
            
            if (message.body === '1') {
                paymentMethod = 'Efectivo';
            } else if (message.body === '2') {
                paymentMethod = 'Datáfono';
            } else if (message.body === '3') {
                paymentMethod = 'Transferencia bancaria';
            } else {
                await client.sendMessage(message.from, '⚠️ Por favor, seleccione una opción válida (1, 2 o 3)');
                return;
            }
            
            customerData.saveField(message.from, 'purchase', 'paymentMethod', paymentMethod);
            
            // Si seleccionó transferencia, enviar datos bancarios
            if (message.body === '3') {
                // Enviar mensaje con los datos bancarios
                await client.sendMessage(message.from, '*DATOS PARA TRANSFERENCIA BANCARIA*\nPor favor realice la transferencia a los siguientes datos:');
                
                // Enviar imagen con los datos bancarios

                const bankInfoMedia = MessageMedia.fromFilePath('./assets/QR Bancolombia.jpeg');
                await client.sendMessage(message.from, bankInfoMedia, {caption: 'Datos bancarios para transferencia'});
            }
            
            // Continuar con la confirmación del pedido
            userStates.set(message.from, 'purchase_confirm');
            
            // Obtener datos actualizados incluyendo método de pago
            const paymentPurchaseData = customerData.getCustomerData(message.from).purchase.data;
            
            let confirmMessage = `¿Desea confirmar su pedido con pago por *${paymentPurchaseData.paymentMethod}*?

1️⃣ Sí, confirmar pedido
2️⃣ No, cancelar pedido`;
            
            await client.sendMessage(message.from, confirmMessage);
            break;
            
        case 'confirm':
            if (message.body === '1') {
                const orderNumber = customerData.generateReferenceNumber();
                customerData.saveField(message.from, 'purchase', 'orderNumber', orderNumber);
                customerData.updateStatus(message.from, 'purchase', 'confirmed');
                
                const finalPurchaseData = customerData.getCustomerData(message.from).purchase.data;
                await notifyOwnerOfPurchase(finalPurchaseData);
                let confirmationMessage = `✅ *¡Pedido Confirmado!*
                
Su pedido ha sido registrado con éxito.`;

                // Mensaje personalizado según el tipo de pedido
                if (finalPurchaseData.type === 'restaurant') {
                    confirmationMessage += `\nRecibirá su comida en aproximadamente 30-45 minutos.`;
                } else {
                    confirmationMessage += `\nSus productos congelados serán enviados dentro de las próximas 24 horas.`;
                }

                // Añadir información del método de pago
                confirmationMessage += `\n\n*Método de pago:* ${finalPurchaseData.paymentMethod}`;
                
                // Si el pago es por transferencia, agregar mensaje adicional
                if (finalPurchaseData.paymentMethod === 'Transferencia bancaria') {
                    confirmationMessage += `\nPor favor envíe el comprobante de transferencia a este mismo número.`;
                }

                confirmationMessage += `\n\n*Número de pedido:* #${orderNumber}

Escriba "menu" para volver al menú principal.`;
                
                await client.sendMessage(message.from, confirmationMessage);
                
                // Log para fines de monitoreo
                console.log('Nuevo pedido registrado:', 
                            customerData.getCustomerData(message.from).purchase);
                
            } else if (message.body === '2') {
                customerData.updateStatus(message.from, 'purchase', 'cancelled');
                await client.sendMessage(message.from, '❌ Pedido cancelado. Escriba "menu" para volver al menú principal.');
            } else {
                await client.sendMessage(message.from, '⚠️ Por favor, seleccione 1 (Confirmar) o 2 (Cancelar)');
                return;
            }
            userStates.set(message.from, 'main_menu');
            break;
    }
}

// Función para manejar la reserva
async function handleReservation(message) {
    const currentStep = userStates.get(message.from).split('_')[1];
    customerData.initCustomerData(message.from, 'reservation');
    
    switch(currentStep) {
        case 'start':
            await client.sendMessage(message.from, '📝 Por favor, ingrese su nombre completo:');
            userStates.set(message.from, 'reservation_name');
            break;
            
        case 'name':
            customerData.saveField(message.from, 'reservation', 'name', message.body);
            userStates.set(message.from, 'reservation_phone');
            await client.sendMessage(message.from, '📱 Ingrese su número de teléfono:');
            break;
            
        case 'phone':
            customerData.saveField(message.from, 'reservation', 'phone', message.body);
            userStates.set(message.from, 'reservation_date');
            await client.sendMessage(message.from, '📅 Ingrese la fecha deseada (DD/MM/YYYY):');
            break;
            
        case 'date':
            customerData.saveField(message.from, 'reservation', 'date', message.body);
            userStates.set(message.from, 'reservation_time');
            await client.sendMessage(message.from, '⏰ Ingrese la hora deseada (HH:MM):');
            break;
            
        case 'time':
            customerData.saveField(message.from, 'reservation', 'time', message.body);
            userStates.set(message.from, 'reservation_guests');
            await client.sendMessage(message.from, '👥 ¿Cuántas personas asistirán?');
            break;
            
        case 'guests':
            customerData.saveField(message.from, 'reservation', 'guests', message.body);
            userStates.set(message.from, 'reservation_special');
            await client.sendMessage(message.from, '🎉 ¿Es para una ocasión especial?\n\n1️⃣ Sí\n2️⃣ No');
            break;
            
        case 'special':
            if (message.body === '1') {
                userStates.set(message.from, 'reservation_occasion');
                await client.sendMessage(message.from, '🎊 Por favor, cuéntenos qué ocasión especial celebrará:');
            } else if (message.body === '2') {
                customerData.saveField(message.from, 'reservation', 'specialOccasion', 'No');
                userStates.set(message.from, 'reservation_decoration');
                await client.sendMessage(message.from, `🎨 ¿Desea agregar decoración especial a su mesa? Tiene un costo adicional de $20:

1️⃣ Sí, deseo decoración especial
2️⃣ No, gracias`);
            } else {
                await client.sendMessage(message.from, '⚠️ Por favor, seleccione 1 (Sí) o 2 (No)');
            }
            break;
            
        case 'occasion':
            customerData.saveField(message.from, 'reservation', 'specialOccasion', message.body);
            userStates.set(message.from, 'reservation_decoration');
            await client.sendMessage(message.from, `🎨 ¿Desea agregar decoración especial a su mesa? Tiene un costo adicional de $20:

1️⃣ Sí, deseo decoración especial
2️⃣ No, gracias`);
            break;
            
        case 'decoration':
            const decoration = message.body === '1' ? 'Sí' : 'No';
            customerData.saveField(message.from, 'reservation', 'specialDecoration', decoration);
            userStates.set(message.from, 'reservation_confirm');
            
            // Obtener datos actualizados
            const reservationData = customerData.getCustomerData(message.from).reservation.data;
            
            // Crear resumen de la reserva
            const reservationSummary = `*RESUMEN DE SU RESERVA*
👤 Nombre: ${reservationData.name}
📱 Teléfono: ${reservationData.phone}
📅 Fecha: ${reservationData.date}
⏰ Hora: ${reservationData.time}
👥 Personas: ${reservationData.guests}
${reservationData.specialOccasion !== 'No' ? `🎉 Ocasión especial: ${reservationData.specialOccasion}` : ''}
🎨 Decoración especial: ${reservationData.specialDecoration}
${reservationData.specialDecoration === 'Sí' ? '💰 Cargo adicional: $20' : ''}

¿Es correcta esta información?
1️⃣ Sí, confirmar reserva
2️⃣ No, cancelar reserva`;
            
            await client.sendMessage(message.from, reservationSummary);
            break;
            
        case 'confirm':
            if (message.body === '1') {
                const reservationNumber = customerData.generateReferenceNumber();
                customerData.saveField(message.from, 'reservation', 'reservationNumber', reservationNumber);
                customerData.updateStatus(message.from, 'reservation', 'confirmed');
                
                // Obtener datos actualizados
                const confirmedData = customerData.getCustomerData(message.from).reservation.data;
                
                await client.sendMessage(message.from, `✅ *¡Reserva Confirmada!*
                
Su reserva ha sido registrada con éxito.

*Número de reserva:* #${reservationNumber}
*Fecha:* ${confirmedData.date}
*Hora:* ${confirmedData.time}
*Personas:* ${confirmedData.guests}

Nos pondremos en contacto para confirmar los detalles.
Escriba "menu" para volver al menú principal.`);
                
                // Log para fines de monitoreo
                console.log('Nueva reserva registrada:', 
                            customerData.getCustomerData(message.from).reservation);
                
            } else if (message.body === '2') {
                customerData.updateStatus(message.from, 'reservation', 'cancelled');
                await client.sendMessage(message.from, '❌ Reserva cancelada. Escriba "menu" para volver al menú principal.');
            } else {
                await client.sendMessage(message.from, '⚠️ Por favor, seleccione 1 (Confirmar) o 2 (Cancelar)');
                return;
            }
            userStates.set(message.from, 'main_menu');
            break;
    }
}

// Función para mostrar historial del cliente
async function handleHistory(message) {
    const userData = customerData.getCustomerData(message.from);
    
    if (!userData || ((!userData.purchase || Object.keys(userData.purchase.data).length === 0) && 
                      (!userData.reservation || Object.keys(userData.reservation.data).length === 0))) {
        await client.sendMessage(message.from, 'No tiene ningún historial de pedidos o reservas con nosotros.');
        userStates.set(message.from, 'main_menu');
        return;
    }
    
    let historyMessage = '*SU HISTORIAL*\n\n';
    
    if (userData.purchase && 
        userData.purchase.data && 
        userData.purchase.data.status === 'confirmed') {
        
        const purchaseData = userData.purchase.data;
        historyMessage += `🛒 *ÚLTIMO PEDIDO:*\n`;
        
        // Mostrar el tipo de pedido en el historial
        if (purchaseData.type === 'restaurant') {
            historyMessage += `📋 Tipo: Restaurante\n`;
        } else if (purchaseData.type === 'frozen') {
            historyMessage += `📋 Tipo: Productos Congelados\n`;
        }
        
        historyMessage += `🔢 Número: #${purchaseData.orderNumber}\n`;
        historyMessage += `📆 Fecha: ${new Date(userData.purchase.data.confirmationTime).toLocaleString()}\n`;
        historyMessage += `👤 Nombre: ${purchaseData.name}\n`;
        historyMessage += `📱 Teléfono: ${purchaseData.phone}\n`;
        historyMessage += `🏠 Dirección: ${purchaseData.address}\n\n`;
        historyMessage += `*Productos ordenados:*\n`;
        historyMessage += `${purchaseData.items.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\n`;
    }
    
    if (userData.reservation && 
        userData.reservation.data && 
        userData.reservation.data.status === 'confirmed') {
        
        const reservationData = userData.reservation.data;
        historyMessage += `🗓️ *ÚLTIMA RESERVA:*\n`;
        historyMessage += `🔢 Número: #${reservationData.reservationNumber}\n`;
        historyMessage += `👤 Nombre: ${reservationData.name}\n`;
        historyMessage += `📱 Teléfono: ${reservationData.phone}\n`;
        historyMessage += `📅 Fecha: ${reservationData.date}\n`;
        historyMessage += `⏰ Hora: ${reservationData.time}\n`;
        historyMessage += `👥 Personas: ${reservationData.guests}\n`;
        
        if (reservationData.specialOccasion && reservationData.specialOccasion !== 'No') {
            historyMessage += `🎉 Ocasión especial: ${reservationData.specialOccasion}\n`;
        }
        
        historyMessage += `🎨 Decoración especial: ${reservationData.specialDecoration}\n`;
    }
    
    historyMessage += '\nEscriba "menu" para volver al menú principal.';
    
    await client.sendMessage(message.from, historyMessage);
    userStates.set(message.from, 'main_menu');
}

// Manejador principal de mensajes
client.on('message', async message => {
    console.log('Mensaje recibido:', message.body); // Para depuración
    const userState = userStates.get(message.from) || 'none';
    
    // Convierte el mensaje a minúsculas y elimina espacios extra
    const messageText = message.body.toLowerCase().trim();
    console.log('Estado actual:', userState); // Para depuración

    // Comando para volver al menú principal
    if (messageText === 'menu') {
        await handleMainMenu(message);
        return;
    }
    
    // Comando para mostrar historial del cliente
    if (messageText === 'historial') {
        await handleHistory(message);
        return;
    }

    // Manejo de todos los mensajes cuando no hay estado
    if (userState === 'none') {
        const saludos = ['hola', 'buenos dias', 'buenas tardes', 'restaurante'];
        
        if (saludos.includes(messageText)) {
            console.log('Iniciando menú principal desde saludo:', messageText); // Para depuración
            await handleMainMenu(message);
            return;
        }
        return; // Ignora otros mensajes cuando no hay estado
    }

    // Manejo del menú principal
    if (userState === 'main_menu') {
        switch(messageText) {
            case '1':
                await client.sendMessage(message.from, restaurantInfo);
                await client.sendMessage(message.from, '\nEscriba "menu" para volver al menú principal o "historial" para ver sus pedidos anteriores');
                break;
            case '2':
                // Mostrar el submenú de compra
                await handlePurchaseMenu(message);
                break;
            case '3':
                userStates.set(message.from, 'reservation_start');
                await handleReservation(message);
                break;
            case '4':
                await handleAdvisorContact(message);
                break;
            default:
                await client.sendMessage(message.from, 'Por favor, seleccione una opción válida (1, 2 o 3)');
        }
        return;
    }

    // Manejo del submenú de compra
    if (userState === 'purchase_menu') {
        switch(messageText) {
            case '1':
                try {
                    const menuPdf = MessageMedia.fromFilePath('./assets/Menu Restaurante.pdf');
                    await client.sendMessage(message.from, menuPdf, {
                        caption: '🍽️ Aquí tiene nuestro menú de restaurante'
                    });
                    
                    // Iniciar proceso de compra para restaurante
                    userStates.set(message.from, 'purchase_start');
                    await handlePurchase(message, 'restaurant');
                    
                } catch (error) {
                    console.error('Error al enviar el PDF:', error);
                    await client.sendMessage(message.from, 'Lo siento, hubo un problema al enviar el menú. Por favor, intente más tarde.\n\nEscriba "menu" para volver al menú principal');
                }
                break;
            case '2':
                try {
                    // Enviar imagen o catálogo de productos congelados
                    const frozenProductsImg = MessageMedia.fromFilePath('./assets/Productos Congelados.png');
                    await client.sendMessage(message.from, frozenProductsImg, {
                        caption: '❄️ Aquí tiene nuestro catálogo de productos congelados'
                    });
                    
                    // Iniciar proceso de compra para productos congelados
                    userStates.set(message.from, 'purchase_start');
                    await handlePurchase(message, 'frozen');
                    
                } catch (error) {
                    console.error('Error al enviar la imagen:', error);
                    await client.sendMessage(message.from, 'Lo siento, hubo un problema al enviar el catálogo. Por favor, intente más tarde.\n\nEscriba "menu" para volver al menú principal');
                }
                break;
            default:
                await client.sendMessage(message.from, 'Por favor, seleccione una opción válida (1 o 2)');
        }
        return;
    }

    // Manejo de la compra
    if (userState.startsWith('purchase_')) {
        // Obtener el tipo de compra desde los datos del cliente
        const userData = customerData.getCustomerData(message.from);
        let purchaseType = 'restaurant'; // Valor predeterminado
        
        if (userData && userData.purchase && userData.purchase.data && userData.purchase.data.type) {
            purchaseType = userData.purchase.data.type;
        }
        
        await handlePurchase(message, purchaseType);
        return;
    }

    // Manejo de la reserva
    if (userState.startsWith('reservation_')) {
        await handleReservation(message);
        return;
    }
});

// Eventos del cliente
client.on('qr', qr => {
    console.log('QR RECIBIDO: ');
    qrcode.generate(qr, {small: true});
});

client.on('ready', () => {
    console.log('Bot listo y conectado');
});

client.on('disconnected', (reason) => {
    console.log('Bot desconectado:', reason);
    console.log('Intentando reconectar...');
    client.initialize();
});

client.on('auth_failure', (msg) => {
    console.error('Error de autenticación:', msg);
});

client.initialize()
    .catch(err => {
        console.error('Error durante la inicialización:', err);
    });