import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Intent } from 'src/app/models/intent-model';
import { ActionGPTTask } from 'src/app/models/action-model';
import { TYPE_GPT_MODEL, TYPE_UPDATE_ACTION, variableList } from '../../../../../utils';
import { OpenaiService } from 'src/app/services/openai.service';
import { LoggerService } from 'src/chat21-core/providers/abstract/logger.service';
import { LoggerInstance } from 'src/chat21-core/providers/logger/loggerInstance';
import { MatDialog } from '@angular/material/dialog';
import { AppConfigService } from 'src/app/services/app-config';
import { AttributesDialogComponent } from './attributes-dialog/attributes-dialog.component';
import { Subscription } from 'rxjs';
import { IntentService } from 'src/app/chatbot-design-studio/services/intent.service';

@Component({
  selector: 'cds-action-gpt-task',
  templateUrl: './cds-action-gpt-task.component.html',
  styleUrls: ['./cds-action-gpt-task.component.scss']
})
export class CdsActionGPTTaskComponent implements OnInit {

  @ViewChild('scrollMe', { static: false }) scrollContainer: ElementRef;
  
  @Input() intentSelected: Intent;
  @Input() action: ActionGPTTask;
  @Input() project_id: string; 
  @Input() previewMode: boolean = true;
  @Output() updateAndSaveAction = new EventEmitter;
  @Output() onConnectorChange = new EventEmitter<{type: 'create' | 'delete',  fromId: string, toId: string}>()
  
  listOfIntents: Array<{name: string, value: string, icon?:string}>;

  panelOpenState = false;
  model_list: Array<{ name: string, value: string }>;
  ai_response: string = "";
  ai_error: string = "Oops! Something went wrong. Check your GPT Key or retry in a few moment."
  // ai_error: string = "Oops! Something went wrong."

  showPreview: boolean = false;
  missingVariables: boolean = true;
  showVariablesBtn: boolean = false;
  showVariablesSection: boolean = false;
  showAiError: boolean = false;
  searching: boolean = false;
  temp_variables = [];

  // Connectors
  idIntentSelected: string;
  idConnectorTrue: string;
  idConnectorFalse: string;
  idConnectionTrue: string;
  idConnectionFalse: string;
  isConnectedTrue: boolean = false;
  isConnectedFalse: boolean = false;
  connector: any;
  private subscriptionChangedConnector: Subscription;
  
  private logger: LoggerService = LoggerInstance.getInstance();
  constructor(
    private dialog: MatDialog,
    private openaiService: OpenaiService,
    private intentService: IntentService,
    private appConfigService: AppConfigService,
  ) { }

  ngOnInit(): void {
    this.logger.debug("[ACTION GPT-TASK] ngOnInit action: ", this.action);
    this.model_list = Object.values(TYPE_GPT_MODEL).filter(el=> el.status !== 'inactive')
    this.subscriptionChangedConnector = this.intentService.isChangedConnector$.subscribe((connector: any) => {
      this.logger.debug('[ACTION-ASKGPT] isChangedConnector -->', connector);
      this.connector = connector;
      this.updateConnector();
    });
    if(this.intentSelected){
      this.initializeConnector();
    }
    this.initializeAttributes();

    if (!this.action.preview) {
      this.action.preview = []; // per retrocompatibilità
    }
  }

  ngOnChanges(changes: SimpleChanges) {
  }

  ngOnDestroy() {
    if (this.subscriptionChangedConnector) {
      this.subscriptionChangedConnector.unsubscribe();
    }
  }

  initializeConnector() {
    this.idIntentSelected = this.intentSelected.intent_id;
    this.idConnectorTrue = this.idIntentSelected+'/'+this.action._tdActionId + '/true';
    this.idConnectorFalse = this.idIntentSelected+'/'+this.action._tdActionId + '/false';
    this.listOfIntents = this.intentService.getListOfIntents();
    this.checkConnectionStatus();
  }

  private checkConnectionStatus(){
    if(this.action.trueIntent){
      this.isConnectedTrue = true;
      const posId = this.action.trueIntent.indexOf("#");
      if (posId !== -1) {
        const toId = this.action.trueIntent.slice(posId+1);
        this.idConnectionTrue = this.idConnectorTrue+"/"+toId;
      }
    } else {
      this.isConnectedTrue = false;
      this.idConnectionTrue = null;
    }
    if(this.action.falseIntent){
      this.isConnectedFalse = true;
      const posId = this.action.falseIntent.indexOf("#");
      if (posId !== -1) {
        const toId = this.action.falseIntent.slice(posId+1);
        this.idConnectionFalse = this.idConnectorFalse+"/"+toId;
      }
     } else {
      this.isConnectedFalse = false;
      this.idConnectionFalse = null;
     }
  }

  private updateConnector(){
    try {
      const array = this.connector.fromId.split("/");
      const idAction= array[1];
      if(idAction === this.action._tdActionId){
        if(this.connector.deleted){
          if(array[array.length -1] === 'true'){
            this.action.trueIntent = null;
            this.isConnectedTrue = false;
            this.idConnectionTrue = null;
          }        
          if(array[array.length -1] === 'false'){
            this.action.falseIntent = null;
            this.isConnectedFalse = false;
            this.idConnectionFalse = null;
          }
          if(this.connector.save)this.updateAndSaveAction.emit({type: TYPE_UPDATE_ACTION.CONNECTOR, element: this.connector});
        } else { 
          // TODO: verificare quale dei due connettori è stato aggiunto (controllare il valore della action corrispondente al true/false intent)
          this.logger.debug('[ACTION-ASKGPT] updateConnector', this.connector.toId, this.connector.fromId ,this.action, array[array.length-1]);
          if(array[array.length -1] === 'true'){
            // this.action.trueIntent = '#'+this.connector.toId;
            this.isConnectedTrue = true;
            this.idConnectionTrue = this.connector.fromId+"/"+this.connector.toId;
            this.action.trueIntent = '#'+this.connector.toId;
            if(this.connector.save)this.updateAndSaveAction.emit({type: TYPE_UPDATE_ACTION.CONNECTOR, element: this.connector});
          }        
          if(array[array.length -1] === 'false'){
            // this.action.falseIntent = '#'+this.connector.toId;
            this.isConnectedFalse = true;
            this.idConnectionFalse = this.connector.fromId+"/"+this.connector.toId;
            this.action.falseIntent = '#'+this.connector.toId;
            if(this.connector.save)this.updateAndSaveAction.emit({type: TYPE_UPDATE_ACTION.CONNECTOR, element: this.connector});
          }
        }
      }
    } catch (error) {
      this.logger.error('[ACTION-ASKGPT] updateConnector error: ', error);
    }
  }


  private initializeAttributes() {
    let new_attributes = [];
    if (!variableList.find(el => el.key ==='userDefined').elements.some(v => v.name === 'gpt_reply')) {
      new_attributes.push({ name: "gpt_reply", value: "gpt_reply" });
    }
    variableList.find(el => el.key ==='userDefined').elements = [...variableList.find(el => el.key ==='userDefined').elements, ...new_attributes];
    this.logger.debug("[ACTION GPT-TASK] Initialized variableList.userDefined: ", variableList.find(el => el.key ==='userDefined'));
  }

  onChangeTextarea($event: string, property: string) {
    this.logger.debug("[ACTION GPT-TASK] changeTextarea event: ", $event);
    this.logger.debug("[ACTION GPT-TASK] changeTextarea propery: ", property);
    this.action[property] = $event;
    // this.checkVariables();
    // this.updateAndSaveAction.emit();
  }

  onBlur(event){
    this.updateAndSaveAction.emit();
  }

  onSelectedAttribute(event, property) {
    this.logger.log("[ACTION GPT-TASK] onEditableDivTextChange event", event)
    this.logger.log("[ACTION GPT-TASK] onEditableDivTextChange property", property)
    this.action[property] = event.value;
    this.updateAndSaveAction.emit();
  }

  onChangeSelect(event, target) {
    this.logger.debug("[ACTION GPT-TASK] onChangeSelect event: ", event.value)
    this.logger.debug("[ACTION GPT-TASK] onChangeSelect target: ", target)
    this.action[target] = event.value;
    this.updateAndSaveAction.emit();
  }

  updateSliderValue(event, target) {
    this.logger.debug("[ACTION GPT-TASK] updateSliderValue event: ", event)
    this.logger.debug("[ACTION GPT-TASK] updateSliderValue target: ", target)
    this.action[target] = event;

    this.updateAndSaveAction.emit();
  }

  onChangeBlockSelect(event:{name: string, value: string}, type: 'trueIntent' | 'falseIntent') {
    if(event){
      this.action[type]=event.value
      switch(type){
        case 'trueIntent':
          this.onConnectorChange.emit({ type: 'create', fromId: this.idConnectorTrue, toId: this.action.trueIntent});
          break;
        case 'falseIntent':
          this.onConnectorChange.emit({ type: 'create', fromId: this.idConnectorFalse, toId: this.action.falseIntent});
          break;
      }
      this.updateAndSaveAction.emit({type: TYPE_UPDATE_ACTION.ACTION, element: this.action});
    }
  }

  onResetBlockSelect(event:{name: string, value: string}, type: 'trueIntent' | 'falseIntent') {
    switch(type){
      case 'trueIntent':
        this.onConnectorChange.emit({ type: 'delete', fromId: this.idConnectorTrue, toId: this.action.trueIntent});
        break;
      case 'falseIntent':
        this.onConnectorChange.emit({ type: 'delete', fromId: this.idConnectorFalse, toId: this.action.falseIntent});
        break;
    }
    this.action[type]=null
    this.updateAndSaveAction.emit({type: TYPE_UPDATE_ACTION.ACTION, element: this.action});
  }

  scrollToBottom(): void {
    setTimeout(() => {
      try {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
        this.scrollContainer.nativeElement.animate({ scrollTop: 0 }, '500');
      } catch (error) {
        this.logger.log('scrollToBottom ERROR: ', error);
      }
    }, 300);
  }

  execPreview() {
    this.scrollToBottom();
    this.checkVariables().then((resp) => {

      if (resp === true) {
        this.getResponse(this.action.question);

      } else {
        this.openAttributesDialog();
      }

    })
  }

  checkVariables() {
    return new Promise((resolve, reject) => {
      let regex: RegExp = /{{[^{}]*}}/g;
      let string = this.action.question;
      let matches = string.match(regex);
      let response: boolean = true;

      if (!matches || matches.length == 0) {
        resolve(true);

      } else {

        this.temp_variables = [];
        matches.forEach((m) => {
          let name = m.slice(2, m.length - 2);
          let attr = this.action.preview.find(v => v.name === name);

          if (attr && attr.value) {
            this.temp_variables.push({ name: name, value: attr.value });

          } else if (attr && !attr.value) {
            this.temp_variables.push({ name: name, value: null });

          } else {
            this.temp_variables.push({ name: name, value: null });
            this.action.preview.push({ name: name, value: null });
          }
        })
        resolve(false);
      }
    })
  }

  getResponse(question) {
    this.logger.log("getResponse called...")

    let data = {
      question: question,
      context: this.action.context,
      model: this.action.model,
      max_tokens: this.action.max_tokens,
      temperature: this.action.temperature
    }

    this.showAiError = false;
    this.searching = true;
    this.showPreview = true;

    setTimeout(() => {
      let element = document.getElementById("preview-container");
      element.classList.remove('preview-container-extended')
    }, 200)

    this.openaiService.previewPrompt(data).subscribe((ai_response: any) => {
      this.searching = false;
      setTimeout(() => {
        let element = document.getElementById("preview-container");
        element.classList.add('preview-container-extended')
      }, 200)
      this.ai_response = ai_response;
    }, (error) => {
      this.searching = false;
      this.logger.error("[ACTION GPT-TASK] previewPrompt error: ", error);
      setTimeout(() => {
        let element = document.getElementById("preview-container");
        element.classList.add('preview-container-extended')
      }, 200)
      this.showAiError = true;
    }, () => {
      this.logger.debug("[ACTION GPT-TASK] preview prompt *COMPLETE*: ");
      this.searching = false;
    })

  }


  // getResponsePreview() {

  //   this.showPreview = true;
  //   this.showAiError = false;

  //   this.checkVariables().then((resp) => {

  //     if (resp === false) {
  //       this.missingVariables = true;

  //     } else {
  //       let temp_question = this.action.question;
  //       this.temp_variables.forEach((tv) => {
  //         let old_value = "{{" + tv.name + "}}";
  //         temp_question = temp_question.replace(old_value, tv.value);
  //       })

  //       this.searching = true;
  //       this.missingVariables = false;

  //       setTimeout(() => {
  //         let element = document.getElementById("preview-container");
  //         element.classList.remove('preview-container-extended')
  //       }, 200)

  //       let data = {
  //         question: temp_question,
  //         context: this.action.context,
  //         model: this.action.model,
  //         max_tokens: this.action.max_tokens,
  //         temperature: this.action.temperature
  //       }

  //       this.openaiService.previewPrompt(data).subscribe((ai_response: any) => {
  //         this.searching = false;
  //         setTimeout(() => {
  //           let element = document.getElementById("preview-container");
  //           element.classList.add('preview-container-extended')
  //         }, 200)
  //         this.ai_response = ai_response;
  //       }, (error) => {
  //         this.logger.error("[ACTION GPT-TASK] previewPrompt error: ", error);
  //         setTimeout(() => {
  //           let element = document.getElementById("preview-container");
  //           element.classList.add('preview-container-extended')
  //         }, 200)
  //         this.showAiError = true;
  //         this.searching = false;
  //       }, () => {
  //         this.logger.error("[ACTION GPT-TASK] preview prompt *COMPLETE*: ");
  //         this.searching = false;
  //       })
  //     }
  //   })
  // }

  // _checkVariables() {
  //   return new Promise((resolve, reject) => {
  //     let regex: RegExp = /{{[^{}]*}}/g;
  //     let string = this.action.question;
  //     let matches = string.match(regex);
  //     let response: boolean = true;

  //     if (!matches || matches.length == 0) {
  //       this.showVariablesBtn = false;
  //       resolve(response);
  //     }

  //     if (matches.length > 0) {
  //       if (!this.action.preview) {
  //         this.action.preview = [];
  //       }
  //       this.showVariablesBtn = true;
  //       this.temp_variables = [];

  //       matches.forEach((m) => {
  //         let name = m.slice(2, m.length - 2);
  //         let attr = this.action.preview.find(v => v.name === name);
  //         if (attr && attr.value) {
  //           this.temp_variables.push({ name: name, value: attr.value });
  //         } else if (attr && !attr.value) {
  //           response = false;
  //           this.temp_variables.push({ name: name, value: null });
  //         } else {
  //           response = false;
  //           this.temp_variables.push({ name: name, value: null });
  //           this.action.preview.push({ name: name, value: null });
  //         }
  //       })
  //       this.logger.log("temp_variables: ", this.temp_variables)
  //       resolve(response);
  //     }

  //   })
  // }

  // showHideVariablesSection() {
  //   this.showVariablesSection = !this.showVariablesSection;
  //   if (this.showVariablesSection == false) {
  //     this.getResponsePreview();
  //   }
  // }

  // onChangeVar(event, name) {
  //   let index = this.action.preview.findIndex(v => v.name === name);
  //   if (index != -1) {
  //     this.action.preview[index].value = event;
  //   }
  //   this.updateAndSaveAction.emit();
  // }

  // closePreview() {
  //   let element = document.getElementById("preview-container");
  //   element.classList.remove('preview-container-extended')

  //   this.showPreview = false;
  //   this.searching = false;
  // }

  openAttributesDialog() {
    this.logger.log("temp_variables: ", this.temp_variables);
    const dialogRef = this.dialog.open(AttributesDialogComponent, {
      panelClass: 'custom-setattribute-dialog-container',
      data: { attributes: this.temp_variables, question: this.action.question }
    });
    dialogRef.afterClosed().subscribe(result => {
      this.logger.log("AttributesDialogComponent result: ", result);
      if (result !== false) {
        this.getResponse(result.question);
        this.saveAttributes(result.attributes);
      }
    });
  }

  saveAttributes(attributes) {
    this.logger.log("attributes: ", attributes);
    attributes.forEach(a => {
      let index = this.action.preview.findIndex(v => v.name === a.name)
      if (index != -1) {
        this.action.preview[index].value = a.value;
      } else {
        this.action.preview.push({ name: a.name, value: a.value })
      }
      this.updateAndSaveAction.emit();
    })
  }

  goToKNB(){
    let url = this.appConfigService.getConfig().dashboardBaseUrl + '#/project/' + this.project_id +'/knowledge-bases'
    window.open(url, '_blank')
  }

}
